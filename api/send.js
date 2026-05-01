// Vercel Serverless Function — Daum SMTP 릴레이
// 환경변수: DAUM_USER, DAUM_PASS, RELAY_SECRET
const nodemailer = require('nodemailer');

module.exports = async (req, res) => {
  // CORS (Cloudflare 호출 허용)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Secret');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  // 공유 시크릿 인증
  if (req.headers['x-secret'] !== process.env.RELAY_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { to, subject, html, text, pdfBase64, pdfName } = req.body || {};
  if (!to || !subject) return res.status(400).json({ error: 'to/subject 필수' });

  const transporter = nodemailer.createTransport({
    host: 'smtp.daum.net',
    port: 465,
    secure: true,
    auth: {
      user: process.env.DAUM_USER,    // 예: eungyu26@hanmail.net
      pass: process.env.DAUM_PASS,    // Daum 외부 SMTP 사용 비밀번호
    },
    // Vercel 함수 한도(10s) 안에서 명확한 에러를 받도록 짧은 타임아웃
    connectionTimeout: 7000,
    greetingTimeout: 5000,
    socketTimeout: 7000,
    logger: false,
    debug: false,
  });

  try {
    const info = await transporter.sendMail({
      from: `"한솔치과기공소" <${process.env.DAUM_USER}>`,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      html: html || undefined,
      text: text || undefined,
      attachments: pdfBase64
        ? [{ filename: pdfName || 'invoice.pdf', content: pdfBase64, encoding: 'base64' }]
        : [],
    });
    return res.status(200).json({ ok: true, messageId: info.messageId });
  } catch (e) {
    // Vercel Logs에 자세한 정보 남김
    console.error('[mail-relay] sendMail failed:', {
      code: e.code, command: e.command, response: e.response, message: e.message,
    });
    return res.status(500).json({
      error: e.message || 'unknown',
      code: e.code || null,
      response: e.response || null,
    });
  }
};
