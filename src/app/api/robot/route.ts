/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("key") !== process.env.ROBOT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Daftar 50+ Saham Top IHSG
    const topStocks = [
      "BBCA.JK",
      "BBRI.JK",
      "TLKM.JK",
      "ASII.JK",
      "UNVR.JK",
      "SMGR.JK",
      "INCO.JK",
      "ADRO.JK",
      "CPIN.JK",
      "GGRM.JK",
      "TINS.JK",
      "JPFA.JK",
      "BRPT.JK",
      "MEDC.JK",
      "RECK.JK",
      "ICBP.JK",
      "PGAS.JK",
      "MNCN.JK",
      "BBTN.JK",
      "BMTR.JK",
      "ANTM.JK",
      "UNTR.JK",
      "INDF.JK",
      "COAL.JK",
      "KLBF.JK",
      "HMSP.JK",
      "ASRI.JK",
      "AKRA.JK",
      "MIRA.JK",
      "PLIN.JK",
      "TREM.JK",
      "ISAT.JK",
      "EXCL.JK",
      "AUTO.JK",
      "MTDL.JK",
      "MTEL.JK",
      "DSSA.JK",
      "SITU.JK",
      "RODA.JK",
      "INAI.JK",
      "INKP.JK",
      "RAJA.JK",
      "PJAA.JK",
      "SCMA.JK",
      "PRAS.JK",
      "BNBR.JK",
      "ELSA.JK",
      "SILO.JK",
      "PROY.JK",
      "HGII.JK",
      "INET.JK",
      "ACES.JK",
      "WBSA.JK",
      "CDIA.JK",
      "TPIA.JK",
      "DEWA.JK",
      "BRENT.JK",
      "BUMI.JK",
      "BRMS.JK",
      "BIPI.JK",
      "PANI.JK",
    ];

    // 1. Ambil Data Harga & Berita secara Paralel
    const allData = await Promise.all(
      topStocks.map(async (symbol) => {
        try {
          // Fetch Harga 1 Bulan (Timeframe 1 Jam)
          const priceRes = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1h&range=1mo`,
          );
          const priceJson = await priceRes.json();
          const result = priceJson.chart?.result?.[0];
          if (!result) return null;

          const newsRes = await fetch(
            `https://finance.yahoo.com/rss/headline?s=${symbol}`,
          );
          const newsText = await newsRes.text();

          // Ambil Item Berita (Judul & Link)
          const items =
            newsText.match(/<item>([\s\S]*?)<\/item>/g)?.slice(0, 2) || [];
          const newsWithLinks = items.map((item) => {
            const title = item.match(/<title>(.*?)<\/title>/)?.[1] || "";
            const link = item.match(/<link>(.*?)<\/link>/)?.[1] || "";
            return { title, link };
          });

          const highs = result.indicators.quote[0].high.filter(
            (v: any) => v != null,
          );
          const lows = result.indicators.quote[0].low.filter(
            (v: any) => v != null,
          );
          const currentPrice = result.meta.regularMarketPrice;

          const high = Math.max(...highs);
          const low = Math.min(...lows);

          // Filter Matematika Fibonacci 0.618 - 0.786
          const fibo618 = high - (high - low) * 0.618;
          const fibo786 = high - (high - low) * 0.786;

          // add moving average 20
          const closes = result.indicators.quote[0].close.filter(
            (v: any) => v != null,
          );

          // Pastikan ada data sebelum menghitung
          if (closes.length < 20) return null; // Skip jika data tidak cukup untuk MA20

          const last20Closes = closes.slice(-20);
          const ma20 =
            last20Closes.reduce((a: number, b: number) => a + b, 0) /
            last20Closes.length;

          // Toleransi 1% untuk area buy
          const isNearBuyZone =
            currentPrice <= fibo618 &&
            currentPrice >= fibo786 &&
            currentPrice > ma20;

          if (!isNearBuyZone) return null;

          return {
            symbol,
            currentPrice,
            fibo618,
            fibo786,
            high,
            low,
            news: newsWithLinks,
          };
        } catch (err) {
          return null;
        }
      }),
    );

    const candidates = allData.filter((d) => d !== null);

    // Jika tidak ada sinyal, stop (Hening)
    if (candidates.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No Buy Zone signals found.",
      });
    }

    // Hanya ambil 3 kandidat teratas agar tidak timeout di Vercel
    const finalCandidates = candidates.slice(0, 3);

    // 2. Analisa AI (Fibonacci + Sentiment Berita)
    const aiResponse = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash-001",
          messages: [
            {
              role: "system",
              content: `Anda adalah Ahli Strategi Swing Trading (2-5 hari) IHSG.
            
            TUGAS ANDA:
            1. Verifikasi harga di area Fibonacci 0.618 - 0.786.
            2. Analisa Judul Berita yang diberikan:
               - Jika berita mengindikasikan Fraud, Korupsi, atau Laba turun drastis, berikan status "AVOID".
               - Jika berita Positif atau Netral, berikan status "BUY".
            
            FORMAT OUTPUT (Markdown):
            📈 **[SYMBOL]** - [Price]
            📰 **Sentimen Berita:** [Positif/Negatif/Netral]
            🎯 **Rekomendasi:** [BUY/AVOID]
            📏 **Levels:** Entry: [Price], SL: [Bawah 0.786], TP: [Area High]
            📝 **Analisa:** [Analisa singkat Fibonacci + Berita]
            🔗 **Sumber Berita:** [Judul Berita](Link Berita)`,
            },
            {
              role: "user",
              content: `Data Saham & Berita: ${JSON.stringify(finalCandidates)}`,
            },
          ],
        }),
      },
    );

    const aiData = await aiResponse.json();
    console.log("AI Response:", aiData);
    const recommendation = aiData.choices?.[0]?.message?.content;
    console.log("Recommendation:", recommendation);

    // 3. Kirim ke Telegram (Hanya jika ada rekomendasi)
    if (recommendation) {
      await fetch(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: `🎯 **SWING SIGNALS (FIBO + NEWS)**\n\n${recommendation}`,
            parse_mode: "Markdown",
          }),
        },
      );
    }

    return NextResponse.json({
      success: true,
      signals_found: candidates.length,
      scanned_at: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Critical Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
