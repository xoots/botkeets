# OAuth Migration Setup Guide

## 📋 Overview

This guide covers the optional Claude Agents SDK OAuth migration feature. The OAuth integration provides enhanced authentication for Claude API calls but is **completely optional**. The core functionality of NanoClaw continues to work with standard API key authentication.

## 🔄 Migration Decision Framework

### When to Use OAuth
- **Enhanced Security**: OAuth tokens offer better security than API keys
- **Rate Limit Management**: More flexible rate limiting
- **Token Management**: Better token lifecycle management
- **Enterprise Features**: Required for some Claude Enterprise features

### When to Stick with API Keys
- **Simplicity**: API keys are simpler to manage
- **Multi-Model Focus**: If you primarily use other LLM providers (OpenAI, Ollama)
- **Quick Setup**: Faster initial configuration
- **Non-Claude Workloads**: If Claude usage is minimal

## 🚀 Installation (Optional)

### Prerequisites
```bash
# Install Claude CLI
npm install -g @anthropic-ai/claude-agent-sdk

# Authenticate with Claude
claude auth login
```

### Migration Script
```bash
# Run migration script
npm run migrate-oauth

# Test the integration
npm run test-oauth-integration
```

## ⚙️ Configuration

### Environment Variables

```bash
# .env file additions
CLAUDE_CODE_OAUTH_TOKEN=your_oauth_token_here

# Remove conflicting API keys if migrating
# ANTHROPIC_API_KEY=your_api_key_here  # Comment out or remove
```

### Migration Workflow

1. **Backup Current Configuration**
```bash
cp .env .env.backup
cp config/claude-config.json config/claude-config.backup.json
```

2. **Set Up OAuth Token**
```bash
# Get your OAuth token from Claude CLI
claude config get oauth_token

# Add to .env
echo "CLAUDE_CODE_OAUTH_TOKEN=$(claude config get oauth_token)" >> .env
```

3. **Test Configuration**
```bash
# Test OAuth wrapper
npm run test-oauth-integration

# Verify functionality
npm start
```

## 🔍 Testing Integration

### Manual Testing
```typescript
import { getClaudeOAuthWrapper } from './src/oauth-sdk-wrapper.js';

const wrapper = await getClaudeOAuthWrapper();
const status = wrapper.getStatus();

console.log('OAuth Status:', {
  initialized: status.initialized,
  tokenAvailable: status.tokenAvailable
});
```

### Automated Testing
```bash
# Run comprehensive tests
npm run test-oauth-integration

# View detailed report
cat test-results/oauth-integration-report.md
```

## 🔧 Troubleshooting

### Common Issues

**Token Invalid or Expired**
```bash
# Re-authenticate
claude auth login

# Update token
claude config set oauth_token $(claude auth get-token)
```

**Environment Conflicts**
```bash
# Check for conflicting variables
grep -E '(ANTHROPIC_API_KEY|CLAUDE_API_KEY)' .env

# Remove conflicting keys
sed -i '' '/ANTHROPIC_API_KEY/d' .env
```

**Migration Errors**
```bash
# Reset to API key authentication
cp .env.backup .env
npm start

# Retry migration after fixing issues
npm run migrate-oauth
```

## 📊 Performance Comparison

### API Key vs OAuth

| Feature | API Keys | OAuth |
|---------|----------|-------|
| Security | Basic | Enhanced |
| Rate Limits | Standard | Flexible |
| Token Management | Manual | Automated |
| Setup Complexity | Simple | Medium |
| Claude Enterprise | Limited | Full Access |

### Cost Impact

**OAuth Benefits:**
- More efficient token usage
- Better rate limiting for high-volume usage
- Lower effective cost per token for heavy workloads

**API Key Benefits:**
- Simpler cost accounting
- Easier debugging
- Faster development cycles

## 🔄 Rollback Procedure

### Step 1: Backup Current State
```bash
# Backup OAuth configuration
cp .env .env.oauth-backup
cp config/claude-config.json config/claude-config.oauth-backup.json
```

### Step 2: Restore API Key Configuration
```bash
# Restore original .env
cp .env.backup .env

# Or manually edit .env
# Change: CLAUDE_CODE_OAUTH_TOKEN=token_here
# To: ANTHROPIC_API_KEY=your_api_key_here
```

### Step 3: Verify Rollback
```bash
# Test API key functionality
npm start

# Check logs for authentication method
tail -f logs/nanoclaw.log | grep -i auth
```

## 🎯 Best Practices

### For Multi-Model Users
- Use API keys if Claude is secondary provider
- OAuth only if Claude is primary workload
- Monitor cost differences between authentication methods

### For Claude-Centric Users
- OAuth provides better enterprise features
- Recommended for production Claude workloads
- Better long-term maintainability

### Development Workflow
1. Start with API keys for development
2. Migrate to OAuth for production deployments
3. Maintain rollback capability

## 📈 Monitoring & Metrics

### OAuth-Specific Metrics
```typescript
// Track OAuth performance
const metrics = {
  token_refresh_count: 'oauth_token_refreshes_total',
  authentication_errors: 'oauth_auth_errors_total', 
  token_validity_duration: 'oauth_token_valid_seconds'
};
```

### Dashboard Integration
Access OAuth metrics in the built-in dashboard:
```bash
# Start dashboard
node dashboard/server.js

# View at http://localhost:8080/oauth-metrics
```

## 🔮 Future Enhancements

### Planned OAuth Features
- Automated token refresh
- Multi-account OAuth support
- Enterprise SSO integration
- Advanced security policies

---

## ⚠️ Important Notes

- **OAuth is Optional**: NanoClaw works perfectly with API keys
- **Backward Compatible**: Migration doesn't break existing functionality  
- **Rollback Supported**: Easy to revert to API key authentication
- **Performance Neutral**: Both methods have similar performance
- **Multi-Model Friendly**: Works alongside OpenAI/Ollama providers

For questions or issues, refer to the [main documentation](../README.md) or contact the NanoClaw team.