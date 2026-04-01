/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');

  // 1. Keamanan: Cek Secret Key
  if (key !== process.env.ROBOT_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const API_KEY = process.env.TWELVE_DATA_API_KEY;

    // 2. Discovery: Ambil 30 Koin Crypto Teratas
    const listRes = await fetch(`https://api.twelvedata.com/cryptocurrencies`);
    const listData = await listRes.json();
    if (!listData.data) throw new Error("Gagal mengambil data market.");

    const top30Symbols = listData.data
      .slice(0, 30)
      .map((c: any) => `${c.symbol}/USD`)
      .join(',');

    // 3. Teknikal: Ambil Data Kompleks (SMA, EMA, RSI, ATR)
    const complexRes = await fetch(`https://api.twelvedata.com/complex_data?apikey=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbols: top30Symbols.split(','),
        intervals: ["15min"],
        outputsize: 50,
        methods: [
          "quote",
          { name: "rsi", params: { period: 14 } },
          { name: "ema", params: { time_period: 9 } },
          { name: "ema", params: { time_period: 21 } },
          { name: "sma", params: { time_period: 50 } },
          { name: "atr", params: { time_period: 14 } }
        ]
      })
    });
    const techData = await complexRes.json();

    // 4. Sentimen: Fear & Greed Index
    const fgiRes = await fetch("https://api.alternative.me/fng/");
    const fgi = (await fgiRes.json()).data[0];

    // 5. AI Momentum Filter (Llama 3.3 70B Free - Kencang & Gratis)
    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.3-70b-instruct:free",
        messages: [
          { 
            role: "system", 
            content: `Anda adalah SCANNER MOMENTUM ORATNEK V3.0. 
            Tugas: Analisa 30 koin dan HANYA berikan respon jika ada koin yang sedang dalam MOMENTUM BELI BAGUS.
            
            SYARAT MOMENTUM (Wajib):
            1. Harga > SMA 50.
            2. EMA 9 > EMA 21 (Baru cross atau sedang melebar).
            3. Harga di SNIPER ZONE (-0.5 ATR s/d +1 ATR dari EMA 21).
            
            INSTRUKSI PENTING:
            - Jika ada yang memenuhi syarat, kirimkan daftar TOP 7 dengan format: Symbol, Price, SL, TP, dan Alasan Singkat.
            - Jika TIDAK ADA koin yang memenuhi syarat teknikal di atas, Anda WAJIB menjawab hanya dengan satu kata: "NONE". 
            - Jangan memberikan penjelasan apapun jika tidak ada momentum.`
          },
          { 
            role: "user", 
            content: `Data Teknikal: ${JSON.stringify(techData.data)}. Market Sentiment: ${fgi.value}.` 
          }
        ]
      })
    });

    const aiData = await aiResponse.json();
    const recommendation = aiData.choices?.[0]?.message?.content || "NONE";

    // 6. Logika Pengiriman Telegram: HANYA jika bukan "NONE"
    // Kita hilangkan whitespace dan case agar pengecekan lebih akurat
    const checkMomentum = recommendation.trim().toUpperCase();

    if (checkMomentum !== "NONE" && checkMomentum !== "") {
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: `🚀 **MOMENTUM BELI TERDETEKSI (ORATNEK V3.0)**\n\n${recommendation}`,
          parse_mode: "Markdown"
        })
      });
      console.log("Momentum ditemukan, pesan dikirim!");
    } else {
      console.log("Pasar sideways/bearish, tidak ada pesan dikirim.");
    }

    return NextResponse.json({ 
      success: true, 
      scanned: 30, 
      momentum: checkMomentum !== "NONE" 
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}