import { NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';

// Force dynamic agar Vercel tidak melakukan caching pada hasil API
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // 1. Ambil query string 'key' dari URL
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');

  // 2. Validasi Security (Cek apakah key sesuai dengan .env)
  if (key !== process.env.ROBOT_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 3. Ambil Data Saham (Gunakan kode saham Indonesia .JK)
    const symbols = ['BBCA.JK', 'TLKM.JK', 'ASII.JK', 'UNVR.JK'];
    
    // Kita gunakan 'as any[]' untuk menghindari error "Property does not exist on type never"
    const results = await Promise.all(
      symbols.map((sym) => yahooFinance.quote(sym))
    ) as any[];

    // Susun data saham menjadi teks untuk dikirim ke AI
    const stockSummary = results
      .map((s) => {
        const price = s.regularMarketPrice;
        const change = s.regularMarketChangePercent?.toFixed(2);
        return `${s.symbol}: Rp${price} (${change}%)`;
      })
      .join(', ');

    // 4. Kirim Data ke OpenRouter (AI)
    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://your-site.com", // Opsional
        "X-Title": "My Trading Bot", // Opsional
      },
      body: JSON.stringify({
        // Menggunakan model FREE dari OpenRouter
        model: "anthropic/claude-haiku-4.5", 
        messages: [
          { 
            role: "system", 
            content: "Anda adalah analis saham teknikal. Berikan analisis singkat apakah BUY, SELL, atau HOLD. Gunakan bahasa Indonesia yang santai tapi profesional. Berikan alasan maksimal 2 kalimat." 
          },
          { 
            role: "user", 
            content: `Data Harga Saat Ini: ${stockSummary}. Apa rekomendasinya?` 
          }
        ]
      })
    });

    const aiData = await aiResponse.json();
    
    // Ambil teks hasil generate AI
    const recommendation = aiData.choices?.[0]?.message?.content || "AI gagal memberikan rekomendasi.";

    // 5. Kirim Hasil ke Telegram
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

    const telegramRes = await fetch(telegramUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `🤖 *UPDATE ROBOT TRADING*\n\n${recommendation}\n\n_Data: ${stockSummary}_`,
        parse_mode: "Markdown"
      })
    });

    if (!telegramRes.ok) {
      throw new Error("Gagal mengirim pesan ke Telegram");
    }

    return NextResponse.json({ 
      success: true, 
      message: "Rekomendasi berhasil dikirim ke Telegram",
      data: stockSummary 
    });

  } catch (error: any) {
    console.error("Robot Error:", error.message);
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}