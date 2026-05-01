// Vercel Serverless Function — Daum SMTP 릴레이 (+ IMAP 보낸편지함 저장)
// 환경변수: DAUM_USER, DAUM_PASS, RELAY_SECRET
const nodemailer = require('nodemailer');
const MailComposer = require('nodemailer/lib/mail-composer');
const { ImapFlow } = require('imapflow');

// 동일 메일을 Daum 보낸편지함(IMAP)에 APPEND
async function appendToSentFolder(rawBuffer, user, pass) {
  const client = new ImapFlow({
    host: 'imap.daum.net',
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });
  try {
    await client.connect();
    // Daum의 보낸편지함은 종종 "Sent Messages" 또는 "보낸편지함" — 후보를 순서대로 시도
    const candidates = ['Sent Messages', 'Sent', '보낸편지함', 'INBOX.Sent'];
    let appended = false;
    for (const folder of candidates) {
      try {
        await client.append(folder, rawBuffer, ['\\Seen']);
        appended = true;
        break;
      } catch { /* 다음 폴더 시도 */ }
    }
    if (!appended) {
      // 마지막 수단: \Sent 특수 사용 폴더 자동 탐지
      const list = await client.list();
      const sentBox = list.find(b => (b.specialUse === '\\Sent') || /sent/i.test(b.path));
      if (sentBox) await client.append(sentBox.path, rawBuffer, ['\\Seen']);
    }
  } finally {
    try { await client.logout(); } catch {}
  }
}

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

  const mailOptions = {
    from: `"한솔치과기공소" <${process.env.DAUM_USER}>`,
    to: Array.isArray(to) ? to.join(', ') : to,
    subject,
    html: html || undefined,
    text: text || undefined,
    attachments: pdfBase64
      ? [{ filename: pdfName || 'invoice.pdf', content: pdfBase64, encoding: 'base64' }]
      : [],
  };

  const transporter = nodemailer.createTransport({
    host: 'smtp.daum.net',
    port: 465,
    secure: true,
    auth: {
      user: process.env.DAUM_USER,
      pass: process.env.DAUM_PASS,
    },
    connectionTimeout: 7000,
    greetingTimeout: 5000,
    socketTimeout: 7000,
  });

  try {
    // 1) SMTP 발송
    const info = await transporter.sendMail(mailOptions);

    // 2) IMAP 보낸편지함 저장 (실패해도 발송 자체는 성공으로 처리)
    let sentSaved = false;
    let sentSaveError = null;
    try {
      const composer = new MailComposer(mailOptions);
      const rawBuffer = await new Promise((resolve, reject) => {
        composer.compile().build((err, message) => err ? reject(err) : resolve(message));
      });
      await appendToSentFolder(rawBuffer, process.env.DAUM_USER, process.env.DAUM_PASS);
      sentSaved = true;
    } catch (e) {
      console.error('[mail-relay] IMAP append failed:', e.message);
      sentSaveError = e.message;
    }

    return res.status(200).json({
      ok: true,
      messageId: info.messageId,
      sentSaved,
      sentSaveError,
    });
  } catch (e) {
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
