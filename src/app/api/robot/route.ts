/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');

  if (key !== process.env.ROBOT_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Ambil Data IHSG (Interval 1 Jam, Rentang 1 Bulan agar Swing Valid)
    // Simbol ^JKSE = IHSG
    const yahooRes = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/^JKSE?interval=1h&range=1mo`,
      { next: { revalidate: 0 } }
    );
    const ihsgData = await yahooRes.json();

    const result = ihsgData.chart.result[0];
    const quote = result.indicators.quote[0];
    const currentPrice = result.meta.regularMarketPrice;

    // Filter data null dan ambil 150 candle jam terakhir untuk analisa Swing
    const closes = quote.close.filter((v: any) => v != null);
    const highs = quote.high.filter((v: any) => v != null);
    const lows = quote.low.filter((v: any) => v != null);

    const marketData = {
      symbol: "IHSG (Composite Index)",
      timeframe: "1 Hour (Swing Analysis)",
      current_price: currentPrice,
      highest_monthly: Math.max(...highs),
      lowest_monthly: Math.min(...lows),
      recent_100_hours: closes.slice(-100) 
    };

    // 2. AI Analysis: Strategi Swing Trading 2-5 Hari
    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        messages: [
          { 
            role: "system", 
            content: `Anda adalah Ahli Strategi Swing Trading Saham Indonesia.
            Tugas: Analisa IHSG untuk potensi posisi HOLD selama 2-5 hari ke depan.
            
            LOGIKA FIBONACCI SWING:
            1. Cari Swing High dan Swing Low utama dari data 1 bulan terakhir.
            2. Fokus pada Golden Ratio 0.618 sebagai area entry terbaik untuk pantulan.
            3. Abaikan fluktuasi kecil harian (noise).
            
            FORMAT ANALISA:
            🇮🇩 **IHSG SWING ANALYSIS (2-5 DAYS)**
            💰 Price: [Current Price]
            
            📊 **LEVELS:**
            - Support (Fibo 0.618): [Price]
            - Support Kuat (Fibo 0.786): [Price]
            - Resistance Terdekat: [Price]
            
            🎯 **PREDIKSI 2-5 HARI:**
            - Strategi: [Contoh: Wait & See / Buy on Weakness / Profit Taking]
            - Target TP: [Target harga dalam 5 hari ke depan]
            - Risk: [Batas bawah jika analisa meleset]
            
            📝 Catatan: [Analisa apakah IHSG sedang dalam trend naik atau butuh koreksi sehat].`
          },
          { 
            role: "user", 
            content: `Data Market IHSG: ${JSON.stringify(marketData)}` 
          }
        ]
      })
    });

    const aiData = await aiResponse.json();
    console.log("AI Response:", aiData);
    const recommendation = aiData.choices?.[0]?.message?.content || "Gagal menganalisa.";

    // 3. Kirim ke Telegram
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: recommendation,
        parse_mode: "Markdown"
      })
    });

    return NextResponse.json({ success: true, mode: "Swing Analysis" });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}