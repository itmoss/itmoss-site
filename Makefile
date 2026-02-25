.PHONY: dev build preview install clean check help alias

# ============================================================================
# itmoss-site (Astro) Makefile
# ============================================================================

# 도움말
help:
	@echo "itmoss-site Makefile 명령어:"
	@echo ""
	@echo "📦 설치:"
	@echo "  make install     - npm 패키지 설치"
	@echo ""
	@echo "🚀 개발:"
	@echo "  make dev         - 로컬 개발 서버 시작 (http://localhost:4321)"
	@echo "  make publish-dev - 개발 서버 시작 (dev와 동일)"
	@echo ""
	@echo "🔨 빌드:"
	@echo "  make build       - 프로덕션 빌드 (dist/)"
	@echo "  make preview     - 빌드 결과물 로컬 미리보기"
	@echo ""
	@echo "🛠️  유틸리티:"
	@echo "  make check       - 개발 환경 상태 확인"
	@echo "  make clean       - 빌드 산출물 및 의존성 삭제"
	@echo ""
	@echo "💡 빠른 시작: make install && make dev"

# itmoss-site 에이전트 별칭 표시
alias:
	@printf "\033[34m╔══════════════════════════════════════════════════════════════╗\033[0m\n"
	@printf "\033[34m║\033[32m       🤖 itmoss-site 부서 에이전트 & 호출 별칭              \033[34m║\033[0m\n"
	@printf "\033[34m╠══════════════════════════════════════════════════════════════╣\033[0m\n"
	@printf "\033[34m║\033[0m %-20s │ %-36s \033[34m║\033[0m\n" "📌 역할" "📣 호출 별칭 (Mentions)"
	@printf "\033[34m╟──────────────────────┼──────────────────────────────────────╢\033[0m\n"
	@printf "\033[34m║\033[0m \033[36m%-20s\033[0m │ \033[33m%-36s\033[0m \033[34m║\033[0m\n" "사이트 매니저" "@itmoss-manager, @사이트매니저"
	@printf "\033[34m║\033[0m \033[36m%-20s\033[0m │ \033[33m%-36s\033[0m \033[34m║\033[0m\n" "사이트 디자이너" "@itmoss-designer, @사이트디자이너"
	@printf "\033[34m║\033[0m \033[36m%-20s\033[0m │ \033[33m%-36s\033[0m \033[34m║\033[0m\n" "사이트 개발자" "@itmoss-dev, @사이트개발자"
	@printf "\033[34m║\033[0m \033[36m%-20s\033[0m │ \033[33m%-36s\033[0m \033[34m║\033[0m\n" "사이트 퍼블리셔" "@itmoss-publisher, @사이트퍼블리셔"
	@printf "\033[34m╚══════════════════════════════════════════════════════════════╝\033[0m\n"
	@echo ""
	@printf "\033[33m💡 [Tip]\033[0m 예시: \"@itmoss-dev 홈 페이지 Hero 섹션 애니메이션 추가해줘\"\n"

# 개발 환경 확인
check:
	@echo "🔍 개발 환경 확인 중..."
	@echo ""
	@echo "📦 Node.js:"
	@node --version 2>/dev/null || echo "❌ Node.js 미설치"
	@echo "📦 npm:"
	@npm --version 2>/dev/null || echo "❌ npm 미설치"
	@echo "🚀 Astro:"
	@npx astro --version 2>/dev/null || echo "❌ Astro 미설치 (make install 실행)"
	@echo ""
	@echo "💡 문제가 있다면 'make install'을 실행하세요."

# 패키지 설치
install:
	@echo "📦 npm 패키지 설치 중..."
	npm install
	@echo "✅ 설치 완료! → make dev 로 시작하세요."

# 로컬 개발 서버 (http://localhost:4321)
dev:
	@echo "🚀 Astro 개발 서버 시작 중..."
	@echo "🌐 http://localhost:4321"
	npm run dev

publish-dev: dev

# 프로덕션 빌드
build:
	@echo "🔨 프로덕션 빌드 중..."
	npm run build
	@echo "✅ 빌드 완료! (dist/)"

# 빌드 결과물 미리보기
preview:
	@echo "👁️  빌드 미리보기 서버 시작 중..."
	@echo "🌐 http://localhost:4321"
	npm run preview

# 정리
clean:
	@echo "🗑️  빌드 산출물 및 의존성 정리 중..."
	rm -rf dist node_modules package-lock.json
	@echo "✅ 정리 완료! → make install 로 재설치하세요."
