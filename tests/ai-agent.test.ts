import { describe, it, expect } from 'vitest';
import { executeFallbackRuleParser } from '../lib/ai-agent/tools';

describe('AI Agent Rule Parser', () => {
  it('identifies business stats query in Tamil', async () => {
    const result = await executeFallbackRuleParser('இன்றைய விற்பனை மற்றும் வசூல் விபரம் என்ன?');
    expect(result.reply).toContain('இன்றைய பிசினஸ் நிலவரம்');
    expect(result.actionResult?.type).toBe('BUSINESS_STATS');
  });

  it('identifies stats query in English / Tanglish', async () => {
    const result = await executeFallbackRuleParser('today sales stats');
    expect(result.actionResult?.type).toBe('BUSINESS_STATS');
  });

  it('provides helpful welcome guidance for unknown commands', async () => {
    const result = await executeFallbackRuleParser('வணக்கம் எப்படி இருக்கீங்க?');
    expect(result.reply).toContain('Revathi Medicals AI அசிஸ்டன்ட்');
  });
});
