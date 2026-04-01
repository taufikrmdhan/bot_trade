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

    // 2. DISCOVERY: Ambil daftar koin crypto terbaru
    const listRes = await fetch(`https://api.twelvedata.com/cryptocurrencies`);
    const listData = await listRes.json();
    
    if (!listData.data) throw new Error("Gagal mengambil daftar koin dari Twelve Data");

    // Ambil 30 koin teratas (biasanya urutan market cap/volume)
    const top30Symbols = listData.data
      .slice(0, 30)
      .map((c: any) => `${c.symbol}/USD`)
      .join(',');

    // 3. DATA TEKNIKAL: Ambil Quote + Indikator Oratnek (SMA, EMA, RSI, ATR)
    const complexUrl = `https://api.twelvedata.com/complex_data?apikey=${API_KEY}`;
    const complexBody = {
      symbols: top30Symbols.split(','),
      intervals: ["15min"],
      outputsize: 50, // Dibutuhkan untuk SMA 50 dan Volume Profile sederhana
      methods: [
        "quote",
        { name: "rsi", params: { period: 14 } },
        { name: "ema", params: { time_period: 9 } },
        { name: "ema", params: { time_period: 21 } },
        { name: "sma", params: { time_period: 50 } },
        { name: "atr", params: { time_period: 14 } }
      ]
    };

    const techRes = await fetch(complexUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(complexBody)
    });
    const techData = await techRes.json();

    // 4. SENTIMEN: Ambil Fear & Greed Index
    const fgiRes = await fetch("https://api.alternative.me/fng/");
    const fgiJson = await fgiRes.json();
    const fgi = fgiJson.data[0];

    // 5. AI ANALYSIS: Gunakan Logika Oratnek V3.0 untuk memfilter Top 7
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
            content: `Anda adalah SCANNER CRYPTO ORATNEK V3.0. Analisa 30 koin dan pilih MAKSIMAL 7 koin terbaik (TOP 7).
            
            LOGIKA TEKNIKAL (ORATNEK):
            1. Trend Base: Harga WAJIB di atas SMA 50 (Bullish Only).
            2. Momentum: EMA 9 Golden Cross EMA 21 (Sudah terjadi atau baru mulai).
            3. Sniper Zone: Harga di area -0.5 ATR s/d +1 ATR dari EMA 21 (Sweet Spot).
            4. RSI: Keluar dari zona extreme 30/70.
            5. Volume: Relative Volume > 1.5x (Pocket Pivot indicator).
            6. DCR%: Close harus di atas 70% range candle (Bullish conviction).
            
            FORMAT OUTPUT TELEGRAM:
            🏆 **TOP 7 OPPORTUNITIES (ORATNEK V3.0)**
            
            1. [SYMBOL] - [Action: BUY/WAIT]
            💰 Price: [Current Price] | RSI: [Val]
            🎯 Target (TP): [RR 1:2]
            🛑 Stop Loss (SL): [1.5x ATR dari Entry]
            📝 Reason: [Jelaskan singkat kondisi EMA/SMA/ATR/Volume]
            
            (Ulangi sampai koin ke-7)
            
            📊 Market Sentiment: ${fgi.value} (${fgi.value_classification})`
          },
          { 
            role: "user", 
            content: `Analisa 30 koin ini: ${JSON.stringify(techData.data)}` 
          }
        ]
      })
    });

    const aiData = await aiResponse.json();
    const finalMessage = aiData.choices?.[0]?.message?.content || "Sinyal tidak ditemukan (Market Sideways).";

    // 6. TELEGRAM: Kirim hasil ke bot kamu
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: finalMessage,
        parse_mode: "Markdown"
      })
    });

    return NextResponse.json({ 
      success: true, 
      scanned_count: 30, 
      status: "Report sent to Telegram" 
    });

  } catch (error: any) {
    console.error("Robot V3 Error:", error.message);
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}