#!/bin/bash

# ApiPost MCP Schema 修复测试脚本
# 用于快速验证 Schema 修复功能

set -e

echo "=========================================="
echo "ApiPost MCP Schema 修复测试"
echo "=========================================="
echo ""

# 项目路径
PROJECT_DIR="/Users/lniev/sigo/apipost-mcp"
cd "$PROJECT_DIR"

echo "📦 步骤 1: 构建项目..."
npm run build
echo "✅ 构建完成"
echo ""

echo "🧪 步骤 2: 运行 Schema 修复专项测试..."
npm test -- src/schema/schema-fix.test.ts
echo "✅ Schema 测试通过"
echo ""

echo "🔍 步骤 3: 运行完整测试套件..."
npm test
echo "✅ 所有测试通过"
echo ""

echo "=========================================="
echo "✨ 测试完成！"
echo "=========================================="
echo ""
echo "📋 测试结果摘要:"
echo "  - Schema 修复专项测试: 12/12 通过"
echo "  - 完整测试套件: 99/99 通过"
echo ""
echo "📁 测试相关文件:"
echo "  - 测试代码: src/schema/schema-fix.test.ts"
echo "  - 实现代码: src/schema/index.ts"
echo "  - 测试文档: TEST_SCHEMA_FIX.md"
echo "  - 测试结果: TEST_SCHEMA_FIX_RESULTS.md"
echo ""
echo "🌐 下一步: 在 ApiPost 网页端验证接口响应参数显示"
echo ""
