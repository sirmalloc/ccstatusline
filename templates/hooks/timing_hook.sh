#!/bin/bash
# Claude Code Task Timer Hook
# 功能：统计 Claude Code 任务执行时间并在状态栏实时显示
#
# 双模式设计：
#   - Hook 模式：被 Claude Code 调用时，处理事件并记录时间
#   - Display 模式：被 ccstatusline 调用时，显示当前任务耗时
#
# 支持多实例并行运行，使用 session_id 区分不同实例

TIMING_DIR="$HOME/.claude/.timing"

# 从 stdin 读取 JSON 数据（Claude Code 会传入事件数据）
INPUT=$(cat)

# 解析 hook 事件类型
HOOK_EVENT=$(echo "$INPUT" | grep -o '"hook_event_name"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')

# 解析 session_id 用于区分不同的 Claude Code 实例
SESSION_ID=$(echo "$INPUT" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')

# 解析 stop_hook_active 字段（防止无限循环）
STOP_HOOK_ACTIVE=$(echo "$INPUT" | grep -o '"stop_hook_active"[[:space:]]*:[[:space:]]*[a-z]*' | sed 's/.*:[[:space:]]*//')

# 如果没有 session_id，使用 fallback（兼容旧版本或单实例场景）
if [ -z "$SESSION_ID" ]; then
    SESSION_ID="default"
fi

# 确保目录存在
mkdir -p "$TIMING_DIR"

# 基于 session_id 的独立文件，支持多实例并行
TIMING_FILE="$TIMING_DIR/timing_${SESSION_ID}"
DURATION_FILE="$TIMING_DIR/duration_${SESSION_ID}"

# 时间格式化函数
format_duration() {
    local ELAPSED=$1
    if [ $ELAPSED -ge 3600 ]; then
        HOURS=$((ELAPSED / 3600))
        MINUTES=$(((ELAPSED % 3600) / 60))
        SECONDS=$((ELAPSED % 60))
        echo "${HOURS}时${MINUTES}分${SECONDS}秒"
    elif [ $ELAPSED -ge 60 ]; then
        MINUTES=$((ELAPSED / 60))
        SECONDS=$((ELAPSED % 60))
        echo "${MINUTES}分${SECONDS}秒"
    else
        echo "${ELAPSED}秒"
    fi
}

# 判断调用模式：如果没有 HOOK_EVENT，说明是 ccstatusline 调用（Display 模式）
if [ -z "$HOOK_EVENT" ]; then
    # Display 模式：实时显示耗时
    if [ -f "$TIMING_FILE" ]; then
        # 任务进行中：计算实时耗时
        START_TIME=$(cat "$TIMING_FILE")
        CURRENT_TIME=$(date +%s)
        ELAPSED=$((CURRENT_TIME - START_TIME))
        DURATION_STR=$(format_duration $ELAPSED)
        echo "执行中：${DURATION_STR}"
    elif [ -f "$DURATION_FILE" ]; then
        # 任务已结束：显示最终耗时
        DURATION_STR=$(cat "$DURATION_FILE")
        echo "执行完成：${DURATION_STR}"
    else
        # 没有任务记录
        echo ""
    fi
    exit 0
fi

# Hook 模式：处理各种事件

if [ "$HOOK_EVENT" = "UserPromptSubmit" ]; then
    # 用户提交 prompt：只有当缓存文件不存在时才记录开始时间
    # 这确保了连续对话不会重置计时
    if [ ! -f "$TIMING_FILE" ]; then
        date +%s > "$TIMING_FILE"
    fi
    # 清除上一次的完成时间显示
    rm -f "$DURATION_FILE"

elif [ "$HOOK_EVENT" = "Stop" ]; then
    # Agent 停止：检查是否是第二次触发（防止无限循环）
    if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
        exit 0
    fi

    # 第一次触发：计算耗时
    if [ -f "$TIMING_FILE" ]; then
        START_TIME=$(cat "$TIMING_FILE")
        END_TIME=$(date +%s)
        DURATION=$((END_TIME - START_TIME))
        DURATION_STR=$(format_duration $DURATION)

        # 保存耗时供 ccstatusline 显示
        echo "$DURATION_STR" > "$DURATION_FILE"

        # 清理开始时间文件
        rm -f "$TIMING_FILE"

        # NOTE: Uncomment the following line to enable decision:block mode
        # This will make Claude output the task duration when tasks complete
        # echo "{\"decision\": \"block\", \"reason\": \"本次任务耗时: ${DURATION_STR}\"}"
        exit 0
    fi

elif [ "$HOOK_EVENT" = "SessionEnd" ]; then
    # 会话结束：清理所有缓存文件
    rm -f "$TIMING_FILE"
    rm -f "$DURATION_FILE"
fi

exit 0
