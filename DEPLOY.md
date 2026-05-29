# 마이로그 배포 가이드 (GitHub + Vercel + Supabase + Google OAuth)

## 1. GitHub 저장소 생성 & push

```powershell
cd C:\Projects\mylog

git init
git add .
git commit -m "Initial commit: mylog app"

# GitHub CLI (로그인: gh auth login)
gh repo create mylog --private --source=. --remote=origin --push
```

저장소 이름을 바꾸려면 `mylog` 대신 원하는 이름을 사용하세요.

수동으로 만들 경우:

1. https://github.com/new 에서 저장소 생성
2. `git remote add origin https://github.com/YOUR_USER/mylog.git`
3. `git branch -M main && git push -u origin main`

---

## 2. Vercel 배포

```powershell
# Vercel CLI (최초 1회: npm i -g vercel && vercel login)
vercel link
vercel --prod
```

또는 [vercel.com](https://vercel.com) → **Add New Project** → GitHub `mylog` 연결 → Deploy

빌드 설정 (자동 인식):

| 항목 | 값 |
|------|-----|
| Framework | Vite |
| Build Command | `corepack pnpm install && corepack pnpm build` |
| Output Directory | `dist` |

`vercel.json`에 SPA 라우팅·Gemini API 프록시가 포함되어 있습니다.

배포 URL 예: `https://mylog-xxx.vercel.app`

---

## 3. Vercel 환경 변수

Vercel 프로젝트 → **Settings → Environment Variables**

| Name | Value | Environments |
|------|--------|--------------|
| `VITE_SUPABASE_URL` | `https://jikcnpliauczluwpmozo.supabase.co` | Production, Preview, Development |
| `VITE_SUPABASE_ANON_KEY` | Supabase 대시보드의 **anon public** 키 | Production, Preview, Development |

저장 후 **Redeploy** (Deployments → ⋯ → Redeploy).

> Gemini API 키는 사용자별로 앱 **설정**에 저장되므로 Vercel env에는 넣지 않습니다.

---

## 4. Supabase URL 설정

[Supabase Dashboard](https://supabase.com/dashboard) → 프로젝트 → **Authentication → URL Configuration**

| 필드 | 값 |
|------|-----|
| **Site URL** | `https://YOUR_VERCEL_DOMAIN.vercel.app` |
| **Redirect URLs** (추가) | `https://YOUR_VERCEL_DOMAIN.vercel.app/**` |
| | `http://localhost:5173/**` (로컬 개발) |

Preview 배포도 쓰면 Preview URL도 Redirect URLs에 추가하세요.

---

## 5. Google OAuth 설정

### A. Google Cloud Console

1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → **Credentials**
2. OAuth 2.0 Client ID (Web application) 선택 또는 생성

**Authorized JavaScript origins**

```
https://YOUR_VERCEL_DOMAIN.vercel.app
http://localhost:5173
```

**Authorized redirect URIs** (Supabase 콜백 — 프로젝트마다 다름)

```
https://jikcnpliauczluwpmozo.supabase.co/auth/v1/callback
```

### B. Supabase에서 Google Provider

**Authentication → Providers → Google**

- Enable Google
- Client ID / Client Secret: Google Cloud에서 복사
- **Save**

### C. 확인

1. Vercel 배포 URL 접속
2. **구글로 로그인** → 로그인 후 같은 URL로 돌아오는지 확인
3. 기록 입력·Gemini 분석 동작 확인

---

## 문제 해결

| 증상 | 확인 |
|------|------|
| 로그인 후 빈 화면 | Supabase Redirect URLs에 Vercel URL 등록 여부 |
| `redirect_uri_mismatch` | Google OAuth redirect URI가 Supabase callback과 일치하는지 |
| Gemini CORS/연결 실패 | Vercel 재배포 후 `/api/gemini` 프록시 동작 여부 |
| 환경 변수 미반영 | Vercel env 저장 후 **Redeploy** |
