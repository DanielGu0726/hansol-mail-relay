# Hansol Mail Relay

Daum SMTP를 통한 청구서 메일 발송 릴레이 (Vercel Serverless).

## 환경변수

Vercel 프로젝트 Settings → Environment Variables 에 추가:

| 키              | 값                                      |
|----------------|----------------------------------------|
| `DAUM_USER`    | `eungyu26@hanmail.net`                |
| `DAUM_PASS`    | Daum 외부 IMAP/SMTP 사용 비밀번호      |
| `RELAY_SECRET` | 랜덤 32자 문자열 (Cloudflare도 동일값) |

## 엔드포인트

`POST /api/send`

Headers: `X-Secret: <RELAY_SECRET>`, `Content-Type: application/json`

Body:
```json
{
  "to": ["a@b.com", "c@d.com"],
  "subject": "[한솔치과기공소] 4월 청구서",
  "html": "<p>본문</p>",
  "text": "본문 (대체)",
  "pdfBase64": "...(선택)",
  "pdfName": "청구서.pdf"
}
```

## 로컬 테스트

```bash
npm install
npx vercel dev
# → http://localhost:3000/api/send 로 POST
```
