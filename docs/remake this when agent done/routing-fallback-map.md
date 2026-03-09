# NanoClaw Routing and Fallback Map

This document provides a comprehensive overview of how NanoClaw routes requests and handles fallbacks across different modes and models.

## Overview

NanoClaw uses a sophisticated routing system that determines the optimal execution path based on:
- Task complexity and requirements
- Available models and their capabilities
- Resource constraints and availability
- User preferences and group configurations

## Routing Flow

### 1. Message Reception
```
[Telegram/Discord/WhatsApp Message]
         ↓
[Channel Handler] → Store in DB
         ↓
[Classifier (qwen3:8b)] → Direct vs Container Task?
         ↓
[Mode Router] → Select execution mode
```

### 2. Mode Selection

#### ECO Mode (Local Only)
- **Models**: qwen3:8b, qwen3:32b, smollm2
- **Constraints**: Limited context (8k-32k tokens)
- **Use Cases**: Simple queries, local tasks
- **Fallback**: STANDARD mode on failure

#### STANDARD Mode (Hybrid)
- **Primary**: Local models (qwen3:8b)
- **Fallback**: Cloud models (OpenRouter, DashScope)
- **Constraints**: Moderate context requirements
- **Use Cases**: Most coding tasks, structured operations

#### PRO Mode (Cloud First)
- **Primary**: Claude, OpenRouter premium models
- **Fallback**: Local models, DashScope
- **Constraints**: High context, complex reasoning
- **Use Cases**: Complex planning, creative tasks

### 3. Provider Chain

```
PRIMARY_PROVIDER → FALLBACK_CHAIN
       ↓
   [Claude API] → [OpenRouter] → [DashScope] → [Local Ollama]
```

## Model Capabilities Matrix

| Model | Context Size | Best For | Fallback Trigger |
|-------|-------------|----------|------------------|
| smollm2 | 2k tokens | Simple tasks | Context overflow, rate limits |
| qwen3:8b | 8k tokens | Coding, planning | Rate limits, complex queries |
| qwen3:32b | 32k tokens | Large context tasks | Rate limits, unavailable |
| Claude | 200k tokens | Complex reasoning | Rate limits, quota exceeded |
| OpenRouter | 128k tokens | Creative tasks | Rate limits, model unavail |
| DashScope | Variable | Chinese tasks | Rate limits, regional blocks |

## Fallback Scenarios

### Rate Limit Handling
1. **Detection**: API returns rate limit error codes
2. **Response**: Deactivate provider temporarily (1 hour cooldown)
3. **Routing**: Move to next provider in chain
4. **Notification**: Log event and continue execution

### Context Overflow
1. **Detection**: Model returns context length exceeded error
2. **Response**: Trigger context compression using local qwen3:8b
3. **Routing**: Retry with compressed context
4. **Fallback**: Switch to higher-context model if available

### Provider Unavailable
1. **Detection**: Connection timeouts, model not found errors
2. **Response**: Mark provider as inactive temporarily
3. **Routing**: Skip to next available provider
4. **Recovery**: Periodic health checks to restore provider

## Session Management

Each group maintains separate sessions per provider to ensure:
- Context continuity within provider
- Isolated failures between providers
- Independent rate limit tracking

## Configuration via Environment

Key environment variables that affect routing:
- `PRIMARY_PROVIDER`: Sets the primary model provider
- `FALLBACK_CHAIN`: Defines fallback provider order
- `CLAUDE_API_KEY`: Enables PRO mode Claude access
- `OPENROUTER_API_KEY`: Enables OpenRouter access
- `DASHSCOPE_API_KEY`: Enables DashScope access

## Monitoring and Recovery

The system continuously monitors:
- Provider response times and errors
- Rate limit status
- Context usage patterns
- Session health

Automatic recovery mechanisms:
- Provider cooldown periods
- Context compression for overflow
- Mode escalation on persistent failures
- Session recreation on timeout