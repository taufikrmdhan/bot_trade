/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');

  // 1. Validasi Keamanan
  if (key !== process.env.ROBOT_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const API_KEY = process.env.TWELVE_DATA_API_KEY;

    // 2. Daftar Simbol Spesifik (Forex & Major Crypto)
    // Twelve Data menggunakan format "EUR/USD" untuk Forex dan "BTC/USD" untuk Crypto
    const symbols = [
      "EUR/USD", "USD/JPY", "GBP/USD", "AUD/USD", 
      "XAU/USD", "NZD/USD", "USD/CHF", "BTC/USD", "ETH/USD"
    ].join(',');

    // 3. Teknikal: Ambil Data OHLC (Timeframe 1h untuk Fibonacci Mantap)
    const complexRes = await fetch(`https://api.twelvedata.com/complex_data?apikey=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbols: symbols.split(','),
        intervals: ["1h"],
        outputsize: 50, // Mengambil 50 candle untuk mencari Swing High/Low yang valid
        methods: ["quote"]
      })
    });
    const techData = await complexRes.json();

    // 4. Sentimen: Fear & Greed Index
    const fgiRes = await fetch("https://api.alternative.me/fng/");
    const fgi = (await fgiRes.json()).data[0];

    // 5. AI Analysis: Fokus Fibonacci Retracement 0.618 & 0.786
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
            content: `Anda adalah Ahli Analisa Forex & Crypto dengan Strategi Fibonacci.
            Tugas: Analisa list koin/pair yang diberikan dan cari peluang pantulan (rebound).
            
            KRITERIA ENTRY:
            - Cari Swing High & Swing Low terkuat dalam 50 candle terakhir.
            - Fokus pada harga yang sedang RETRACE ke level:
              a. 0.618 (Golden Ratio)
              b. 0.786 (Deep Retracement/Support Terakhir)
            - Tambahkan konfirmasi dari Support & Resistance horizontal terdekat.
            
            INSTRUKSI OUTPUT:
            - Berikan analisa hanya untuk pair yang MENDEKATI area Fibonacci tersebut.
            - Jika tidak ada yang masuk area, balas HANYA dengan satu kata: "NONE".
            - Jangan bertele-tele.`
          },
          { 
            role: "user", 
            content: `Analisa pair ini: ${JSON.stringify(techData.data)}. Market Sentiment: ${fgi.value}.` 
          }
        ]
      })
    });

    const aiData = await aiResponse.json();
    const recommendation = aiData.choices?.[0]?.message?.content || "NONE";

    // 6. Logika Pengiriman Telegram
    const isSignalFound = recommendation.trim().toUpperCase() !== "NONE";

    if (isSignalFound) {
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: `📊 **FOREX & CRYPTO SCANNER (FIBO)**\n\n${recommendation}`,
          parse_mode: "Markdown"
        })
      });
      console.log("Sinyal ditemukan dan dikirim!");
    } else {
      //jika tidak ada sinyal, munculkan pesan cuma analisa kondisi pasar dan pair yang discan (tidak console log tapi pesan di telegram)
        await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: `📊 **FOREX & CRYPTO SCANNER (FIBO)**\n\nTidak ada sinyal yang ditemukan.\n\nKondisi pasar saat ini:\n- Fear & Greed Index: ${fgi.value}\n- Pair yang di-scan: ${symbols.split(',').join(', ')}`,
            parse_mode: "Markdown"
          })
        });
      console.log("Belum ada pair di area Fibonacci 0.618/0.786.");
    }

    return NextResponse.json({ 
      success: true, 
      scanned_pairs: symbols.split(','), 
      signal: isSignalFound 
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}