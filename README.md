# 마이로그 (mylog)

개인 일기·루틴·식사 기록 앱 (React + Vite + Supabase + Gemini)

## 로컬 실행

```bash
corepack pnpm install
cp .env.example .env   # Supabase 키 입력
corepack pnpm dev
```

## 배포

GitHub → Vercel → Supabase OAuth 설정은 **[DEPLOY.md](./DEPLOY.md)** 를 따르세요.

필수 Vercel 환경 변수:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
