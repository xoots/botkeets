# NanoClaw Complete Token Flow Map

This document details the complete lifecycle of tokens through the NanoClaw system, from initial user input to final response generation.

## Overview

Tokens flow through multiple stages in NanoClaw, each with specific handling, transformation, and optimization strategies. Understanding this flow is crucial for system optimization and debugging.

## Stage 1: Input Reception and Initial Processing

### Message Ingestion
```
[User Input] → Channel Handler → Database Storage
     ↓
Raw text content with metadata (sender, timestamp, chat context)
```

### Override Parsing
```
Raw Content
    ↓
[Override Parser] → Check for mode tags (!eco, !pro, !std)
    ↓
Cleaned Content + Mode Override (if any)
```

### Context Estimation
```
Cleaned Content
    ↓
[Token Estimator] → Character count / 4 approximation
    ↓
Estimated Token Count
```

## Stage 2: Mode and Provider Selection

### Classification and Mode Routing
```
Estimated Tokens + Cleaned Content
    ↓
[Classifier (qwen3:8b)] → Direct vs Container Task
    ↓
[Mode Router] → Select ECO/STANDARD/PRO based on:
    - Task complexity score
    - User override tags
    - Group preferences
    - Available model health
```

### Context Budget Checking
```
Selected Mode + Token Count
    ↓
[Context Manager] → Check against model limits
    ↓
Budget Status: OK / Compression Needed / Mode Escalation
```

### Provider Chain Building
```
Selected Mode
    ↓
[Provider Strategy] → Build provider chain:
    PRIMARY_PROVIDER → FALLBACK_CHAIN filtering
    ↓
[Health Check] → Remove inactive/degraded providers
    ↓
Active Provider Chain (ranked by preference and health)
```

## Stage 3: Pre-Processing and Optimization

### Context Compression Decision
```
Budget Status
    ↓
Compression Required? → Yes/No
    ↓
[Context Manager] → If yes:
    - Use last N turns uncompressed (SWE-Agent pattern)
    - Compress older turns with qwen3:8b locally
    - Generate <compressed-history> block
```

### Anchor Generation
```
Task State + Model Context Size
    ↓
[Task State Manager] → Generate context anchor:
    Full (≥32k tokens): Complete history
    Medium (≥8k tokens): Current state + last output
    Minimal (<8k tokens): Task summary only
```

### Final Prompt Assembly
```
System Components:
├── System Prompt (role, instructions)
├── Context Anchor (generated above)
├── Current Task/Subtask
└── User Message (original or compressed)

Assembled Prompt = System Prompt + Context Anchor + Task + Message
```

## Stage 4: Model Execution

### Provider Selection and Execution
```
Active Provider Chain + Assembled Prompt
    ↓
[Provider Executor] → Try providers in order:
    1. First provider in chain
    2. If failure → next provider
    3. If all fail → escalation protocols
```

### Token Tracking During Execution
```
Model Call
    ↓
[Token Counter] → Track:
    - Input tokens sent
    - Output tokens received
    - Total API usage
    - Rate limit proximity
```

## Stage 5: Response Processing and Error Handling

### Response Reception
```
Model Output
    ↓
Raw text response with potential errors
```

### Error Classification
```
Response/Error Text
    ↓
[Error Classifier] → Identify error type:
    ├── Rate Limit Error
    ├── Context Overflow Error
    ├── Provider Unavailable Error
    └── Other/Success
```

### Fallback Execution
```
Error Type
    ↓
Appropriate Action:
├── Rate Limit: Deactivate provider, try next
├── Context Overflow: Trigger compression, retry
├── Unavailable: Skip provider, continue chain
└── Success: Proceed to post-processing
```

## Stage 6: Post-Processing and Output

### Response Validation
```
Successful Response
    ↓
[Overseer (qwen-plus)] → Evaluate completion quality:
    ├── Complete: Task succeeded
    ├── Reprompt: Need better instructions
    └── Escalate: Human intervention needed
```

### Output Preparation
```
Validation Result
    ↓
[Progress Reporter] → Format for user delivery:
    ├── Direct message (Telegram)
    ├── Thread reply + main channel post (Discord)
    └── Status updates during execution
```

### State Updates
```
Execution Results
    ↓
[Task State Manager] → Update:
    ├── task_state.json with outcomes
    ├── Database records with completion status
    └── Session history for context continuity
```

## Detailed Token Transformation Flows

### ECO Mode Token Flow
```
User Input (100 tokens)
    ↓
Local Model (qwen3:8b/smollm2)
    ↓
Direct Response (no compression)
    ↓
User Output
```

### STANDARD Mode Token Flow
```
User Input (500 tokens)
    ↓
Context Check: Under limit
    ↓
Hybrid Provider (Local → Cloud)
    ↓
Response with potential compression
    ↓
User Output
```

### PRO Mode Token Flow
```
User Input (2000 tokens)
    ↓
Context Check: May require compression
    ↓
Cloud Provider (Claude/OpenRouter)
    ↓
[Compression?] → Local qwen3:8b compression if needed
    ↓
User Output
```

### AUTONOMOUS Mode Token Flow
```
Complex Task Initiation
    ↓
Continuous Context Management
    ↓
Multiple Rounds with Compression
    ↓
Final Output with PR Creation
```

## Compression Pipeline Details

### When Compression Triggers
1. Context budget exceeds 40% threshold
2. Model returns context overflow error
3. Manual override for large contexts

### Compression Process
```
Message History Array
    ↓
[Split] → Recent N turns (uncompressed)
    ↓
[Compress] → Older turns → qwen3:8b summarization
    ↓
[Combine] → [Compressed Block] + [Recent Turns]
    ↓
Reduced Token Count Maintaining Context
```

### Compression Quality Considerations
- **Preservation**: Key facts, file paths, outcomes
- **Format**: Bullet-point summaries for clarity
- **Length**: Controlled by model num_predict parameter
- **Temperature**: Low (0) for factual accuracy

## Provider-Specific Token Handling

### Local Models (Ollama)
```
Request: HTTP POST to OLLAMA_BASE_URL
Tokens: Estimated character/4 ratio
Cost: Zero (local execution)
Latency: Variable based on hardware
```

### Claude API
```
Request: Official API endpoint
Tokens: Accurate token counting
Cost: Per-token billing
Latency: Generally low, regional variation
```

### OpenRouter
```
Request: Proxy API endpoint
Tokens: Model-dependent counting
Cost: Varies by selected model
Latency: Model and region dependent
```

### DashScope
```
Request: Alibaba Cloud endpoint
Tokens: Chinese-optimized counting
Cost: Region-specific pricing
Latency: Optimized for Asian regions
```

## Error Recovery Token Flows

### Rate Limit Recovery
```
Rate Limit Error
    ↓
[Provider Deactivation] → 1-hour cooldown
    ↓
[Chain Shift] → Next available provider
    ↓
[Retry] → Same or adjusted prompt
    ↓
Continued Execution
```

### Context Overflow Recovery
```
Context Overflow Error
    ↓
[Compression Trigger] → Local summarization
    ↓
[Prompt Adjustment] → Insert compressed history
    ↓
[Retry] → With reduced token count
    ↓
Continued Execution
```

### Provider Failure Recovery
```
Provider Timeout/Unavailable
    ↓
[Skip Provider] → Remove from active chain
    ↓
[Next Provider] → Continue with remaining chain
    ↓
[Chain Exhaustion] → Escalation protocols
    ↓
Manual Intervention or Fallback Mode
```

## Monitoring and Analytics

### Real-Time Token Tracking
- Per-provider token usage counters
- Context compression effectiveness metrics
- Response time and success rate tracking
- Rate limit incident logging

### Long-Term Analytics
- Average tokens per task type
- Compression savings statistics
- Provider performance comparisons
- Cost optimization opportunities

## Optimization Opportunities

### Current Bottlenecks
1. **Compression Latency**: Local model summarization adds delay
2. **Provider Chain Delays**: Sequential fallback increases response time
3. **Context Estimation Accuracy**: Character/4 is approximation only

### Potential Improvements
1. **Parallel Provider Attempts**: Try multiple providers simultaneously
2. **Smart Chunking**: Break large contexts into processable pieces
3. **Predictive Compression**: Pre-compress based on task patterns
4. **Adaptive Thresholds**: Dynamic context budget adjustments

This token flow map represents the complete journey of information through the NanoClaw system, highlighting critical points for optimization, monitoring, and troubleshooting.