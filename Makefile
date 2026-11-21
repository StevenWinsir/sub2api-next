.PHONY: build build-backend build-frontend test test-backend test-frontend test-frontend-critical

FRONTEND_CRITICAL_VITEST := \
	src/i18n/__tests__/localeKeyCompleteness.spec.ts \
	src/i18n/__tests__/usedKeys.spec.ts \
	src/api/__tests__/client.spec.ts \
	src/api/__tests__/tokenRefresh.spec.ts \
	src/api/__tests__/keys.bulkUpdate.spec.ts \
	src/api/__tests__/channelMonitorV2.spec.ts \
	src/constants/__tests__/platforms.spec.ts \
	src/core/__tests__/gate.spec.ts \
	src/core/__tests__/bootCorrection.spec.ts \
	src/core/__tests__/registry.spec.ts \
	src/core/__tests__/safeNavigation.spec.ts \
	src/core/__tests__/serviceWorker.spec.ts \
	src/features/payment/__tests__/paymentFlow.spec.ts \
	src/features/payment/__tests__/providerConfig.spec.ts \
	src/features/payment/__tests__/resultLogic.spec.ts \
	src/features/channel-monitor-v2/__tests__/monitorFormat.spec.ts \
	src/features/channel-monitor-v2/__tests__/monitorZoom.spec.ts \
	src/features/admin/settings/__tests__/settingsModel.spec.ts \
	src/features/admin/settings/__tests__/settingsSpec.spec.ts \
	src/features/admin/settings/__tests__/settingsKeys.spec.ts \
	src/features/admin/plugins/__tests__/pluginBridge.spec.ts \
	src/features/admin/risk/__tests__/riskModel.spec.ts \
	src/features/admin/ops/__tests__/opsModel.spec.ts \
	src/__tests__/security.spec.ts \
	scripts/verifyExport.spec.ts \
	scripts/licenses.spec.ts

# 一键编译前后端
build: build-backend build-frontend

# 编译后端（复用 backend/Makefile）
build-backend:
	@$(MAKE) -C backend build

# 编译前端（需要已安装依赖）
build-frontend:
	@pnpm --dir frontend run build

# 运行测试（后端 + 前端）
test: test-backend test-frontend

test-backend:
	@$(MAKE) -C backend test

test-frontend:
	@pnpm --dir frontend run lint:check
	@pnpm --dir frontend run typecheck
	@$(MAKE) test-frontend-critical

test-frontend-critical:
	@pnpm --dir frontend exec vitest run $(FRONTEND_CRITICAL_VITEST)
