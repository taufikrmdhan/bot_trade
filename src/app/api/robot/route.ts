import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');

  if (key !== process.env.ROBOT_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const API_KEY = process.env.TWELVE_DATA_API_KEY;
    // Kita ambil BTC, ETH, dan SOL terhadap USD
    const symbols = 'BTC/USD,ETH/USD,SOL/USD';
    const url = `https://api.twelvedata.com/quote?symbol=${symbols}&apikey=${API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    // Twelve Data mengembalikan objek jika banyak simbol
    // Kita susun datanya untuk AI
    let cryptoSummary = "";
    
    if (data["BTC/USD"]) {
      cryptoSummary = Object.values(data).map((coin: any) => {
        return `${coin.symbol}: $${parseFloat(coin.close).toLocaleString()} (${coin.percent_change}%)`;
      }).join(', ');
    } else {
      // Jika hanya satu simbol atau format error
      cryptoSummary = `Data: ${JSON.stringify(data)}`;
    }

    // --- Panggil OpenRouter (AI) ---
    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "anthropic/claude-haiku-4.5", 
        messages: [
          { 
            role: "system", 
            content: "Anda adalah ahli trading crypto. Berikan analisis singkat (BUY/SELL/HOLD) dengan gaya bahasa yang to-the-point. Maksimal 2 kalimat per koin." 
          },
          { 
            role: "user", 
            content: `Data Crypto Terbaru: ${cryptoSummary}. Berikan rekomendasi.` 
          }
        ]
      })
    });

    const aiData = await aiResponse.json();
    const recommendation = aiData.choices?.[0]?.message?.content || "Gagal mendapatkan rekomendasi AI.";

    // --- Kirim ke Telegram ---
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: `🚀 *BOT CRYPTO REPORT*\n\n${recommendation}\n\n_Data: ${cryptoSummary}_`,
        parse_mode: "Markdown"
      })
    });

    return NextResponse.json({ success: true, summary: cryptoSummary });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}