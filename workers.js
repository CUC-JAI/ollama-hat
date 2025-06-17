const OLLAMA_BASE_URL = "https://cuctunnel02beijing.tuna.pics";

export default {
  async fetch(request) {
    const { pathname } = new URL(request.url);

    // CORS
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    // 获取模型列表
    if (pathname === "/api/models" && request.method === "GET") {
      const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    // 对话/生成请求
    if (pathname === "/api/ollama" && request.method === "POST") {
      const contentType = request.headers.get("content-type") || "";
      let reqBody;
      let files = [];

      if (contentType.includes("multipart/form-data")) {
        const formData = await request.formData();
        reqBody = JSON.parse(formData.get("payload"));
        if (formData.has("image")) {
          const file = formData.get("image");
          const bytes = new Uint8Array(await file.arrayBuffer());
          files.push({
            filename: file.name,
            mimetype: file.type,
            data: bytes,
          });
        }
      } else {
        reqBody = await request.json();
      }

      // 图片 base64
      if (files.length > 0) {
        reqBody.image = `data:${files[0].mimetype};base64,${arrayBufferToBase64(files[0].data)}`;
      }

      if (!reqBody.model) reqBody.model = "llama3";

      const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });

      // 修正：拼接所有 response 字段，防止只取最后一行为空
      const resText = await res.text();
      const lines = resText.trim().split('\n');
      let answer = "";
      for (const line of lines) {
        try {
          const j = JSON.parse(line);
          if (typeof j.response === 'string') answer += j.response;
        } catch(e) {}
      }
      if (!answer.trim()) answer = "模型没有返回内容。";
      return new Response(JSON.stringify({ response: answer }), {
        status: res.status,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    // HTML 交互界面
    if (pathname === "/" && request.method === "GET") {
      return new Response(indexHtml, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  for (let i = 0; i < buffer.length; i++) binary += String.fromCharCode(buffer[i]);
  return btoa(binary);
}

// 嵌入的前端页面
const indexHtml = `
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <title>LLAMA Hat 交互界面</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: sans-serif; margin: 2em; }
    textarea { width: 100%; height: 80px; margin-top: 8px;}
    #result { white-space: pre-wrap; margin-top: 1em; background: #f4f4f4; padding: 1em; border-radius: 6px; }
    #modelSelect { margin-bottom: 10px; }
    .preview { margin-top: 8px; max-width: 200px;}
    button { margin-top: 10px; }
  </style>
</head>
<body>
  <h2>LLAMA Hat交互界面</h2>
  <form id="chatForm">
    <label for="modelSelect">选择模型：</label>
    <select id="modelSelect"></select><br>
    <label>请输入内容：</label>
    <textarea id="prompt" placeholder="说点什么..."></textarea><br>
    <label>选择图片（可选）：</label>
    <input type="file" id="image" accept="image/*"><br>
    <img id="imgPreview" class="preview" style="display:none;" />
    <br>
    <button type="submit">发送</button>
  </form>
  <div id="result"></div>
  <script>
    async function loadModels() {
      document.getElementById('modelSelect').innerHTML = '<option>加载中...</option>';
      try {
        const res = await fetch('/api/models');
        const data = await res.json();
        const select = document.getElementById('modelSelect');
        select.innerHTML = '';
        const models = data.models || data.tags || [];
        models.forEach(m => {
          const name = m.name || m;
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = name;
          select.appendChild(opt);
        });
      } catch(e) {
        document.getElementById('modelSelect').innerHTML = '<option>加载失败</option>';
      }
    }
    loadModels();

    // 图片预览
    document.getElementById('image').addEventListener('change', function(e) {
      const file = e.target.files[0];
      const img = document.getElementById('imgPreview');
      if (file) {
        const reader = new FileReader();
        reader.onload = function(ev) {
          img.src = ev.target.result;
          img.style.display = 'block';
        };
        reader.readAsDataURL(file);
      } else {
        img.style.display = 'none';
      }
    });

    document.getElementById('chatForm').onsubmit = async (e) => {
      e.preventDefault();
      const prompt = document.getElementById('prompt').value.trim();
      const image = document.getElementById('image').files[0];
      const model = document.getElementById('modelSelect').value;
      const formData = new FormData();
      formData.append('payload', JSON.stringify({ prompt, model }));
      if (image) formData.append('image', image);

      document.getElementById('result').textContent = "正在请求...";
      try {
        const res = await fetch('/api/ollama', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        let show;
        if (typeof data.response === "object") {
          show = JSON.stringify(data.response, null, 2);
        } else {
          show = data.response || JSON.stringify(data, null, 2);
        }
        document.getElementById('result').textContent = show;
      } catch (err) {
        document.getElementById('result').textContent = "请求失败：" + err;
      }
    };
  </script>
</body>
</html>
`;
