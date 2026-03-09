# Self-Improvement Implementation Plan

## Overview
This document outlines the implementation plan for enhancing the token tracking and self-improvement capabilities of the NanoClaw system. The goal is to create a closed-loop learning system that can rate outputs, analyze performance, and automatically optimize model routing decisions.

## Current State Analysis

### Existing Components
1. **Routing Logger** (`AGENT/src/routing-logger.ts`)
   - Tracks token usage, cost, latency, success/failure
   - Logs daily JSONL files with comprehensive metrics
   - Supports all major providers (Anthropic, OpenRouter, Ollama, DashScope, DeepSeek)

2. **Task Evaluation Loop**
   - Overseer system evaluates task completions
   - Cline bridge handles structured task summaries
   - Task registry stores evaluation results

3. **Learning Framework Elements**
   - Planned `routing-learnings.jsonl` logging
   - Classifier system designed for learning data consumption
   - Weekly self-improvement summarizer concept defined

## Phase 1: Enhanced Logging and Rating (Week 1-2)

### 1.1 Extend Routing Logger Interface

```typescript
// Extended RoutingLogEntry interface
export interface RoutingLogEntry {
  // Existing fields...
  ts: string;
  chatJid: string;
  intent: string;
  mode: string;
  modeOverride: boolean;
  provider: string;
  model: string;
  requestCount: 1;
  inputTokens: number;
  outputTokens: number;
  usdCost: number;
  latencyMs: number;
  success: boolean;
  fallback: boolean;
  note?: string;
  
  // NEW: Quality and context metrics
  outputQuality?: number;        // 1-5 scale
  qualityRater?: string;         // 'human' | 'automated' | 'hybrid'
  taskComplexity?: string;       // 'simple' | 'medium' | 'complex'
  partialCompletion?: boolean;   // For partial task completions
  inputContextSize?: number;     // Characters or tokens
  outputContextSize?: number;    // Characters or tokens
  contextCompressionRatio?: number; // output/input ratio
  ratingTimestamp?: string;      // When quality was rated
}
```

### 1.2 Implement Quality Rating Service

```typescript
// AGENT/src/quality-rating-service.ts
import { RoutingLogEntry, logRoutingDecision, readRecentLogs } from './routing-logger.js';

export interface QualityRating {
  taskId: string;
  outputQuality: number; // 1-5 scale
  rater: 'human' | 'automated' | 'hybrid';
  context: string; // Reasoning behind rating
  timestamp: string;
}

export class QualityRatingService {
  private ratings: Map<string, QualityRating> = new Map();

  async rateOutput(taskId: string, quality: number, rater: string, context: string): Promise<void> {
    const rating: QualityRating = {
      taskId,
      outputQuality: quality,
      rater,
      context,
      timestamp: new Date().toISOString()
    };
    
    this.ratings.set(taskId, rating);
    
    // Update the routing log entry with quality rating
    // This would require a method to update existing logs or store ratings separately
    await this.updateRoutingLogWithRating(taskId, rating);
  }

  async getRating(taskId: string): Promise<QualityRating | undefined> {
    return this.ratings.get(taskId);
  }

  async getAllRatings(): Promise<QualityRating[]> {
    return Array.from(this.ratings.values());
  }

  private async updateRoutingLogWithRating(taskId: string, rating: QualityRating): Promise<void> {
    // Implementation to associate rating with routing log entry
    // This might involve storing ratings in a separate file or database
  }
}
```

### 1.3 Add Context Size Tracking

Enhance token extraction functions in `routing-logger.ts`:

```typescript
// Enhanced token extraction with context size tracking
export function extractAnthropicUsageWithSize(
  body: { usage?: { input_tokens?: number; output_tokens?: number }; content?: string },
  requestBody: { messages?: Array<{role: string; content: string}> },
  pricePerInputToken: number,
  pricePerOutputToken: number,
): TokenUsage & { inputContextSize?: number; outputContextSize?: number } {
  const inputTokens = body.usage?.input_tokens ?? 0;
  const outputTokens = body.usage?.output_tokens ?? 0;
  const usdCost = inputTokens * pricePerInputToken + outputTokens * pricePerOutputToken;
  
  // Calculate context sizes
  let inputContextSize = 0;
  let outputContextSize = 0;
  
  if (requestBody.messages) {
    inputContextSize = requestBody.messages.reduce((total, msg) => 
      total + (typeof msg.content === 'string' ? msg.content.length : 0), 0);
  }
  
  if (body.content) {
    outputContextSize = typeof body.content === 'string' ? body.content.length : 0;
  }
  
  return { 
    inputTokens, 
    outputTokens, 
    usdCost,
    inputContextSize,
    outputContextSize,
    contextCompressionRatio: inputContextSize > 0 ? outputContextSize / inputContextSize : 0
  };
}
```

## Phase 2: Analysis Engine Development (Week 3-4)

### 2.1 Create Learning Aggregator

```typescript
// AGENT/src/learning-aggregator.ts
import { readRecentLogs, RoutingLogEntry } from './routing-logger.js';

export interface PerformanceMetrics {
  model: string;
  provider: string;
  avgQuality: number;
  avgCost: number;
  avgLatency: number;
  successRate: number;
  totalRequests: number;
  totalTokens: number;
  costPerToken: number;
}

export interface OptimizationRecommendation {
  currentModel: string;
  recommendedModel: string;
  provider: string;
  reason: string;
  expectedImprovement: string;
  confidence: number; // 0-1 scale
}

export class LearningAggregator {
  async analyzePerformance(timeWindowDays: number = 7): Promise<PerformanceMetrics[]> {
    const logs = readRecentLogs(timeWindowDays);
    const metricsByModel = new Map<string, PerformanceMetrics[]>();
    
    // Group logs by model and calculate metrics
    for (const log of logs) {
      const key = `${log.provider}:${log.model}`;
      if (!metricsByModel.has(key)) {
        metricsByModel.set(key, []);
      }
      metricsByModel.get(key)?.push(this.extractMetricsFromLog(log));
    }
    
    // Aggregate metrics
    const results: PerformanceMetrics[] = [];
    for (const [modelKey, metrics] of metricsByModel.entries()) {
      const [provider, model] = modelKey.split(':');
      results.push(this.aggregateMetrics(metrics, model, provider));
    }
    
    return results;
  }

  async generateRecommendations(metrics: PerformanceMetrics[]): Promise<OptimizationRecommendation[]> {
    const recommendations: OptimizationRecommendation[] = [];
    
    // Group by task type/intent for more specific recommendations
    // This would require additional data analysis
    
    for (const metric of metrics) {
      // Cost optimization recommendations
      if (metric.costPerToken > this.getThreshold('cost')) {
        recommendations.push({
          currentModel: metric.model,
          recommendedModel: this.findCheaperAlternative(metric.model),
          provider: metric.provider,
          reason: `High cost per token (${metric.costPerToken.toFixed(6)})`,
          expectedImprovement: `Reduce costs by ${(metric.costPerToken / this.getBaselineCost(metric.model) * 100).toFixed(1)}%`,
          confidence: this.calculateConfidence(metric, 'cost')
        });
      }
      
      // Quality improvement recommendations
      if (metric.avgQuality < this.getThreshold('quality')) {
        recommendations.push({
          currentModel: metric.model,
          recommendedModel: this.findHigherQualityAlternative(metric.model),
          provider: metric.provider,
          reason: `Low average quality (${metric.avgQuality.toFixed(1)})`,
          expectedImprovement: `Improve quality by ${(this.getBaselineQuality(metric.model) - metric.avgQuality).toFixed(1)} points`,
          confidence: this.calculateConfidence(metric, 'quality')
        });
      }
    }
    
    return recommendations;
  }

  private extractMetricsFromLog(log: RoutingLogEntry): any {
    // Extract relevant metrics from log entry
    return {
      quality: log.outputQuality || 3, // Default middle rating
      cost: log.usdCost,
      latency: log.latencyMs,
      success: log.success ? 1 : 0,
      tokens: log.inputTokens + log.outputTokens
    };
  }

  private aggregateMetrics(metrics: any[], model: string, provider: string): PerformanceMetrics {
    const total = metrics.length;
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    
    return {
      model,
      provider,
      avgQuality: sum(metrics.map(m => m.quality)) / total,
      avgCost: sum(metrics.map(m => m.cost)) / total,
      avgLatency: sum(metrics.map(m => m.latency)) / total,
      successRate: sum(metrics.map(m => m.success)) / total,
      totalRequests: total,
      totalTokens: sum(metrics.map(m => m.tokens)),
      costPerToken: sum(metrics.map(m => m.cost)) / sum(metrics.map(m => m.tokens))
    };
  }

  // Threshold and baseline methods would be implemented based on domain knowledge
  private getThreshold(type: string): number { /* implementation */ }
  private getBaselineCost(model: string): number { /* implementation */ }
  private getBaselineQuality(model: string): number { /* implementation */ }
  private findCheaperAlternative(model: string): string { /* implementation */ }
  private findHigherQualityAlternative(model: string): string { /* implementation */ }
  private calculateConfidence(metrics: PerformanceMetrics, type: string): number { /* implementation */ }
}
```

### 2.2 Implement Weekly Summarizer Script

```typescript
// AGENT/scripts/weekly-learning-summarizer.ts
import { LearningAggregator } from '../src/learning-aggregator.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

async function runWeeklySummary() {
  const aggregator = new LearningAggregator();
  
  console.log('Running weekly performance analysis...');
  
  try {
    // Analyze performance from the past week
    const metrics = await aggregator.analyzePerformance(7);
    
    // Generate optimization recommendations
    const recommendations = await aggregator.generateRecommendations(metrics);
    
    // Create summary report
    const report = {
      generated: new Date().toISOString(),
      period: 'Last 7 days',
      performanceMetrics: metrics,
      recommendations: recommendations,
      summary: generateSummary(metrics, recommendations)
    };
    
    // Save to learning directory
    const outputPath = join(process.cwd(), 'memory', 'routing_learnings.json');
    writeFileSync(outputPath, JSON.stringify(report, null, 2));
    
    console.log(`Weekly learning report saved to ${outputPath}`);
    
    // Optional: Send summary to configured notification channels
    await notifyTeam(report);
    
  } catch (error) {
    console.error('Error generating weekly summary:', error);
  }
}

function generateSummary(metrics: PerformanceMetrics[], recommendations: OptimizationRecommendation[]): string {
  const totalRequests = metrics.reduce((sum, m) => sum + m.totalRequests, 0);
  const avgQuality = metrics.reduce((sum, m) => sum + m.avgQuality, 0) / metrics.length;
  const totalCost = metrics.reduce((sum, m) => sum + m.avgCost * m.totalRequests, 0);
  
  return `
Weekly Performance Summary:
- Total Requests: ${totalRequests}
- Average Quality: ${avgQuality.toFixed(2)}/5
- Total Estimated Cost: $${totalCost.toFixed(4)}
- Optimization Opportunities: ${recommendations.length}

Top Recommendations:
${recommendations.slice(0, 3).map(r => 
  `• Switch ${r.currentModel} → ${r.recommendedModel}: ${r.reason}`
).join('\n')}
`;
}

async function notifyTeam(report: any) {
  // Implementation for team notifications (Slack, email, etc.)
  console.log('Would send notification to team with summary');
}

// Run if called directly
if (require.main === module) {
  runWeeklySummary();
}

export { runWeeklySummary };
```

## Phase 3: Integration and Automation (Week 5-6)

### 3.1 Enhance Classifier with Learning Data

Modify the classifier system to consume learning data:

```typescript
// AGENT/src/enhanced-classifier.ts
import { readFileSync } from 'fs';
import { join } from 'path';

interface LearningInsights {
  modelPerformance: Map<string, { successRate: number; avgCost: number; avgQuality: number }>;
  recentFailures: Array<{ model: string; error: string; timestamp: string }>;
  recommendations: Array<{ fromModel: string; toModel: string; reason: string }>;
}

class EnhancedClassifier {
  private learningInsights: LearningInsights | null = null;
  
  constructor() {
    this.loadLearningInsights();
  }
  
  private loadLearningInsights(): void {
    try {
      const insightsPath = join(process.cwd(), 'memory', 'routing_learnings.json');
      const data = readFileSync(insightsPath, 'utf-8');
      this.learningInsights = JSON.parse(data);
    } catch (error) {
      console.warn('Could not load learning insights:', error);
      this.learningInsights = null;
    }
  }
  
  routeIntent(intent: string, context: string): { provider: string; model: string; confidence: number } {
    // Base routing logic (existing)
    let baseRoute = this.baseRoutingLogic(intent, context);
    
    // Apply learning insights if available
    if (this.learningInsights) {
      baseRoute = this.applyLearningInsights(baseRoute, intent, context);
    }
    
    return baseRoute;
  }
  
  private applyLearningInsights(
    route: { provider: string; model: string; confidence: number }, 
    intent: string, 
    context: string
  ): { provider: string; model: string; confidence: number } {
    // Check if current model has poor performance history
    const modelKey = `${route.provider}:${route.model}`;
    const performance = this.learningInsights?.modelPerformance[modelKey];
    
    if (performance && performance.successRate < 0.8) {
      // Look for better alternatives based on recommendations
      const betterModel = this.learningInsights?.recommendations.find(
        rec => rec.fromModel === route.model
      );
      
      if (betterModel) {
        console.log(`Switching from ${route.model} to ${betterModel.toModel}: ${betterModel.reason}`);
        // Return improved route with adjusted confidence
        return {
          provider: route.provider,
          model: betterModel.toModel,
          confidence: Math.min(route.confidence * 0.9, 0.95) // Slightly reduced confidence for changes
        };
      }
    }
    
    return route;
  }
}
```

### 3.2 Create Feedback Collection System

```typescript
// AGENT/src/feedback-collector.ts
import { QualityRatingService } from './quality-rating-service.js';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

interface FeedbackRequest {
  taskId: string;
  prompt: string;
  response: string;
  quality: number;
  comment?: string;
}

class FeedbackCollector {
  private qualityRatingService: QualityRatingService;
  
  constructor() {
    this.qualityRatingService = new QualityRatingService();
  }
  
  async collectHumanFeedback(feedback: FeedbackRequest): Promise<void> {
    // Store human feedback
    await this.qualityRatingService.rateOutput(
      feedback.taskId,
      feedback.quality,
      'human',
      feedback.comment || 'Manual rating'
    );
    
    // Log feedback collection
    this.logFeedback(feedback);
    
    console.log(`Collected feedback for task ${feedback.taskId}: Quality=${feedback.quality}`);
  }
  
  async collectAutomatedFeedback(taskId: string, metrics: any): Promise<void> {
    // Automated quality assessment based on metrics
    const quality = this.calculateAutomatedQuality(metrics);
    
    await this.qualityRatingService.rateOutput(
      taskId,
      quality,
      'automated',
      `Auto-rated based on metrics: ${JSON.stringify(metrics)}`
    );
    
    console.log(`Auto-rated task ${taskId}: Quality=${quality}`);
  }
  
  private calculateAutomatedQuality(metrics: any): number {
    // Simple heuristic for automated quality scoring
    let score = 3; // Neutral starting point
    
    // Adjust based on success
    if (metrics.success === false) score -= 1;
    
    // Adjust based on cost efficiency (lower is better)
    if (metrics.costEfficiency && metrics.costEfficiency < 0.5) score += 0.5;
    if (metrics.costEfficiency && metrics.costEfficiency > 2) score -= 0.5;
    
    // Adjust based on latency (lower is better)
    if (metrics.latencyMs && metrics.latencyMs < 1000) score += 0.5;
    if (metrics.latencyMs && metrics.latencyMs > 5000) score -= 1;
    
    // Clamp to 1-5 range
    return Math.max(1, Math.min(5, score));
  }
  
  private logFeedback(feedback: FeedbackRequest): void {
    const logPath = join(process.cwd(), 'logs', 'feedback.log');
    const logEntry = {
      timestamp: new Date().toISOString(),
      taskId: feedback.taskId,
      quality: feedback.quality,
      comment: feedback.comment,
      source: 'human'
    };
    
    // Append to feedback log
    const existingLog = this.readFeedbackLog(logPath);
    existingLog.push(logEntry);
    writeFileSync(logPath, JSON.stringify(existingLog, null, 2));
  }
  
  private readFeedbackLog(path: string): any[] {
    try {
      const data = readFileSync(path, 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }
}
```

## Phase 4: Monitoring and Dashboard (Week 7-8)

### 4.1 Create Performance Dashboard

```typescript
// AGENT/src/dashboard-generator.ts
import { readRecentLogs } from './routing-logger.js';
import { LearningAggregator } from './learning-aggregator.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

class PerformanceDashboard {
  async generateDashboard(outputPath?: string): Promise<string> {
    const aggregator = new LearningAggregator();
    const logs = readRecentLogs(7);
    
    // Generate dashboard HTML
    const html = this.createDashboardHTML(logs, aggregator);
    
    const dashboardPath = outputPath || join(process.cwd(), 'docs', 'performance-dashboard.html');
    writeFileSync(dashboardPath, html);
    
    return dashboardPath;
  }
  
  private createDashboardHTML(logs: any[], aggregator: LearningAggregator): string {
    const metrics = aggregator.analyzePerformance(7);
    
    return `
<!DOCTYPE html>
<html>
<head>
    <title>NanoClaw Performance Dashboard</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .dashboard { max-width: 1200px; margin: 0 auto; }
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .metric-card { border: 1px solid #ddd; border-radius: 8px; padding: 15px; }
        .chart-container { height: 200px; margin: 20px 0; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <div class="dashboard">
        <h1>NanoClaw Performance Dashboard</h1>
        <div class="metrics-grid">
            ${this.createMetricCards(metrics)}
        </div>
        <h2>Model Performance Table</h2>
        ${this.createPerformanceTable(metrics)}
    </div>
</body>
</html>
    `;
  }
  
  private createMetricCards(metrics: PerformanceMetrics[]): string {
    const totalRequests = metrics.reduce((sum, m) => sum + m.totalRequests, 0);
    const avgQuality = metrics.reduce((sum, m) => sum + m.avgQuality, 0) / metrics.length;
    const totalCost = metrics.reduce((sum, m) => sum + m.avgCost * m.totalRequests, 0);
    
    return `
<div class="metric-card">
    <h3>Total Requests</h3>
    <h2>${totalRequests.toLocaleString()}</h2>
</div>
<div class="metric-card">
    <h3>Average Quality</h3>
    <h2>${avgQuality.toFixed(2)}/5</h2>
</div>
<div class="metric-card">
    <h3>Estimated Cost</h3>
    <h2>$${totalCost.toFixed(4)}</h2>
</div>
    `;
  }
  
  private createPerformanceTable(metrics: PerformanceMetrics[]): string {
    return `
<table>
    <thead>
        <tr>
            <th>Model</th>
            <th>Provider</th>
            <th>Quality</th>
            <th>Success Rate</th>
            <th>Avg Cost</th>
            <th>Requests</th>
        </tr>
    </thead>
    <tbody>
        ${metrics.map(m => `
        <tr>
            <td>${m.model}</td>
            <td>${m.provider}</td>
            <td>${m.avgQuality.toFixed(2)}</td>
            <td>${(m.successRate * 100).toFixed(1)}%</td>
            <td>$${m.avgCost.toFixed(6)}</td>
            <td>${m.totalRequests}</td>
        </tr>
        `).join('')}
    </tbody>
</table>
    `;
  }
}
```

## Deployment and Cron Setup

### Cron Job Configuration

Add to the existing cron system or create new cron jobs:

```bash
# Weekly learning summarizer (runs every Sunday at 2 AM)
0 2 * * 0 cd /path/to/nanoclaw && npx ts-node scripts/weekly-learning-summarizer.ts

# Daily dashboard update (runs every day at 3 AM)
0 3 * * * cd /path/to/nanoclaw && npx ts-node src/dashboard-generator.ts

# Hourly feedback processing (if implementing real-time feedback)
0 * * * * cd /path/to/nanoclaw && npx ts-node src/feedback-processor.ts
```

## Benefits Timeline

### Week 2: Basic Rating System
- Manual quality rating capability
- Enhanced logging with context size tracking
- Initial feedback collection infrastructure

### Week 4: Analysis Engine
- Automated performance analysis
- Cost and quality optimization recommendations
- Weekly learning reports generation

### Week 6: Adaptive Routing
- Classifier enhanced with learning insights
- Dynamic model switching based on performance data
- Closed-loop feedback system operational

### Week 8: Full Monitoring
- Performance dashboard with visualizations
- Real-time monitoring and alerting
- Continuous improvement cycle established

## Risk Mitigation

1. **Data Privacy**: Ensure all collected data is anonymized and stored securely
2. **Performance Impact**: Run analysis jobs during off-peak hours
3. **Storage Growth**: Implement log rotation and archiving policies
4. **Accuracy**: Start with hybrid human+automated rating system
5. **Rollback Capability**: Maintain ability to revert to previous routing decisions

## Success Metrics

1. **Cost Reduction**: 15-25% decrease in API spending within first month
2. **Quality Improvement**: 0.5-1.0 point increase in average output quality rating
3. **Error Reduction**: 20-30% decrease in task failures requiring retries
4. **User Satisfaction**: Positive feedback on output quality and system responsiveness
5. **Operational Efficiency**: Reduced manual intervention for routing decisions

This implementation plan provides a structured approach to building a comprehensive self-improvement system that will continuously optimize the NanoClaw agent's performance based on real-world usage data and feedback.