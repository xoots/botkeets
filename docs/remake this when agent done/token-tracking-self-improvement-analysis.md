# Token Tracking and Self-Improvement Analysis

## What Currently Exists

### 1. Token Tracking Infrastructure
The system already has a robust routing logger implementation in `AGENT/src/routing-logger.ts` that tracks:
- **Token usage**: Input tokens, output tokens, and USD cost per API call
- **Routing decisions**: Intent, mode, provider, model selection
- **Performance metrics**: Latency, success/failure rates
- **Fallback tracking**: When primary providers fail and fallbacks are used

Key features of the existing system:
- Logs to JSONL format in `AGENT/logs/routing-YYYY-MM-DD.jsonl` daily files
- Supports all major providers (Anthropic, OpenRouter, Ollama, DashScope, DeepSeek)
- Tracks cost aggregation by provider and model
- Provides spend summary formatting for status reporting

### 2. Self-Improvement Framework
Several components exist that support self-improvement:

#### Routing Learning System
- **Architecture documentation** mentions planned `routing-learnings.jsonl` logging
- **Implementation plan** describes appending to `AGENT/memory/routing_learnings.md`
- Classifier system is designed to consume learning data via system prompt injection
- Weekly self-improvement summarizer cron is defined but not yet built

#### Task Evaluation Loop
- **Overseer system** evaluates task completion results and makes routing decisions
- **Cline bridge** handles task completion handoff with structured summaries
- **Task registry** stores evaluation results (overseerRetries, overseerDecision, overseerReason)

#### Alert and Feedback Mechanisms
- **Container fallback** sentinel system for failed tasks
- **Rate limit cycle** detection and account cycling
- **Queue drop alerts** for messaging system issues
- **Classifier sidecar** integration for advanced routing

## What Needs to be Added

### 1. Enhanced Token Rating System

#### Output Quality Rating
```
New fields to add to routing logs:
- outputQuality: number (1-5 scale)
- ratingContext: string (reasoning behind rating)
- taskComplexity: string (simple|medium|complex)
- partialCompletion: boolean (for partial task completions)
```

#### Context Size Tracking
```
Additional metrics to capture:
- inputContextSize: number (characters or tokens)
- outputContextSize: number (characters or tokens)
- contextCompressionRatio: number (output/input ratio)
```

### 2. Self-Improvement Analysis Engine

#### Learning Aggregator Component
Need to implement a weekly summarizer that:
- Analyzes past week's routing decisions
- Identifies patterns in successful vs failed routes
- Recommends model/provider switches based on:
  - Cost efficiency ratios
  - Success rates by task type
  - Latency vs quality tradeoffs
  - Token usage optimization opportunities

#### Dynamic Model Switching Logic
Enhance the classifier to consider:
- Historical performance data for similar tasks
- Current provider availability/status
- Budget constraints and optimization goals
- Task priority and quality requirements

### 3. Implementation Roadmap

#### Phase 1: Enhanced Logging
1. Extend `RoutingLogEntry` interface with new rating fields
2. Add context size tracking to token extraction functions
3. Implement manual rating API for human feedback collection
4. Create aggregation utilities for quality metrics

#### Phase 2: Analysis Engine
1. Build weekly summarizer script that processes routing logs
2. Implement pattern recognition for optimal routing decisions
3. Create recommendation engine for model/provider selection
4. Develop automated adjustment mechanisms

#### Phase 3: Integration
1. Wire learning insights back into classifier system
2. Implement dynamic routing adjustments based on performance data
3. Add dashboard/visualization for monitoring improvements
4. Create alerting for significant performance changes

### 4. Proposed Architecture

#### New Components Needed

##### QualityRatingService
```typescript
interface QualityRating {
  taskId: string;
  outputQuality: number; // 1-5 scale
  contextSize: number;
  costEfficiency: number;
  speedQualityTradeoff: number;
  ratingTimestamp: string;
  rater: 'human' | 'automated' | 'hybrid';
}

class QualityRatingService {
  rateOutput(taskId: string, metrics: QualityMetrics): Promise<QualityRating>
  aggregateRatings(filter: RatingFilter): Promise<AggregatedRatings>
  recommendModelSwitch(currentModel: string, taskType: string): Promise<ModelRecommendation>
}
```

##### LearningAggregator
```typescript
interface ModelPerformanceReport {
  model: string;
  provider: string;
  avgQuality: number;
  avgCost: number;
  successRate: number;
  avgLatency: number;
  recommendations: ModelRecommendation[];
}

class LearningAggregator {
  analyzeWeeklyPerformance(): Promise<ModelPerformanceReport[]>
  identifyOptimizationOpportunities(): Promise<OptimizationOpportunity[]>
  generateRoutingAdjustments(): Promise<RoutingAdjustment[]>
}
```

### 5. Benefits of Implementation

#### Cost Optimization
- Automatic switching to most cost-effective providers for specific task types
- Identification of overpaying scenarios
- Budget adherence monitoring

#### Quality Improvement
- Better model selection based on historical performance
- Reduced error rates through learned routing decisions
- Human feedback integration for subjective quality assessment

#### Operational Efficiency
- Automated performance tuning
- Reduced manual intervention for routing decisions
- Proactive issue detection and mitigation

## Next Steps

1. **Extend routing logger** with quality rating fields
2. **Implement manual rating API** for human evaluation
3. **Build analysis scripts** to process existing log data
4. **Create learning aggregator** for weekly performance reports
5. **Integrate insights** back into routing decision system

This foundation will enable the system to continuously improve its model selection and routing decisions based on real performance data, leading to better cost efficiency and higher quality outputs.