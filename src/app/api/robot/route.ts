/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('key') !== process.env.ROBOT_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const API_KEY = process.env.TWELVE_DATA_API_KEY;

    // 1. Discovery 30 Koin Teratas
    const listRes = await fetch(`https://api.twelvedata.com/cryptocurrencies`);
    const listData = await listRes.json();
    const top30Symbols = listData.data.slice(0, 30).map((c: any) => `${c.symbol}/USD`).join(',');

    // 2. Ambil Data OHLC (Open, High, Low, Close) untuk kalkulasi Fibonacci & S/R
    const complexRes = await fetch(`https://api.twelvedata.com/complex_data?apikey=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbols: top30Symbols.split(','),
        intervals: ["30min"], // Timeframe lebih lebar agar S/R lebih kuat
        outputsize: 50, // Mengambil 50 candle terakhir untuk mencari High/Low
        methods: ["quote"]
      })
    });
    const techData = await complexRes.json();

    // 3. AI Analysis: Fibonacci Retracement & S/R Logic
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
            content: `Anda adalah Ahli Analisa Teknikal Fibonacci.
            Tugas: Analisa 30 koin dan cari koin yang harganya sedang REtrace ke area Golden Ratio.
            
            LOGIKA STRATEGI:
            1. Cari Swing High dan Swing Low terkuat dalam 50 candle terakhir.
            2. Tarik Fibonacci Retracement.
            3. Fokus cari Entry di area: 
               - 0.618 (Golden Ratio) - Pantulan Kuat.
               - 0.786 (Deep Retracement) - Support Terakhir sebelum ganti trend.
            4. Konfirmasi: Harga harus berada di area Support Horizontal terkuat (S/R).
            
            INSTRUKSI OUTPUT:
            - Pilih TOP 7 koin yang paling dekat dengan area 0.618 atau 0.786.
            - Jika tidak ada koin di area tersebut, balas: "NONE".
            
            FORMAT TELEGRAM:
            🎯 **FIBONACCI BUY SIGNAL**
            1. [SYMBOL] - [Type: 0.618 / 0.786 Entry]
            💰 Current Price: [Price]
            🚀 Buy Zone (S/R): [Range Area]
            🎯 TP: [High Terakhir] | 🛑 SL: [Di bawah level 1.0 Fibonacci]
            📝 Reason: [Jelaskan posisi harga terhadap garis Fibonaci & Support]`
          },
          { role: "user", content: `Data Market: ${JSON.stringify(techData.data)}` }
        ]
      })
    });

    const aiData = await aiResponse.json();
    const recommendation = aiData.choices?.[0]?.message?.content || "NONE";

    // 4. Kirim Telegram HANYA jika ada momentum Fibonacci
    if (recommendation.trim().toUpperCase() !== "NONE") {
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: recommendation,
          parse_mode: "Markdown"
        })
      });
    }

    return NextResponse.json({ success: true, strategy: "Fibonacci Retracement" });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}