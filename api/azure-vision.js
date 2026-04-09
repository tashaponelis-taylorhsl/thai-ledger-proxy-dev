export const config = { runtime: "edge" };

export default async function handler(req) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "https://tashaponelis-taylorhsl.github.io",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });

  try {
    const { image } = await req.json();
    const apiKey = process.env.AZURE_VISION_KEY;
    const endpoint = "https://extract-vision.cognitiveservices.azure.com";

    // Convert base64 image to binary
    const binaryStr = atob(image);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // Call Azure Computer Vision Read API
    const submitRes = await fetch(
      `${endpoint}/vision/v3.2/read/analyze?language=th`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": apiKey,
          "Content-Type": "application/octet-stream",
        },
        body: bytes,
      }
    );

    if (!submitRes.ok) {
      const err = await submitRes.text();
      return new Response(JSON.stringify({ error: err }), { status: submitRes.status, headers: corsHeaders });
    }

    // Get the operation URL from response headers
    const operationUrl = submitRes.headers.get("Operation-Location");
    if (!operationUrl) {
      return new Response(JSON.stringify({ error: "No operation URL returned" }), { status: 500, headers: corsHeaders });
    }

    // Poll for results (Azure Vision is async)
    let result = null;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const pollRes = await fetch(operationUrl, {
        headers: { "Ocp-Apim-Subscription-Key": apiKey }
      });
      const pollData = await pollRes.json();
      if (pollData.status === "succeeded") {
        result = pollData;
        break;
      }
      if (pollData.status === "failed") {
        return new Response(JSON.stringify({ error: "Azure Vision analysis failed" }), { status: 500, headers: corsHeaders });
      }
    }

    if (!result) {
      return new Response(JSON.stringify({ error: "Azure Vision timed out" }), { status: 504, headers: corsHeaders });
    }

    // Extract text from results
    const lines = result.analyzeResult?.readResults?.flatMap((page) =>
      page.lines?.map((line) => line.text) || []
    ) || [];

    const text = lines.join("\n");
    return new Response(JSON.stringify({ text }), { status: 200, headers: corsHeaders });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
}
