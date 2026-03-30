import { formatResultMessage } from '@/discord/delivery';
import { QAVerdict } from '@/db/schema';

const BASE_PARAMS = {
  title: 'Best headphones under $200',
  agentName: 'price-hunter',
  qaVerdict: QAVerdict.PASS,
  output: '## Results\nSony WH-1000XM5: $179\nBose QC45: $199',
  sources: [
    { url: 'https://amazon.com/dp/B09', title: 'Amazon - Sony WH-1000XM5' },
    { url: 'https://rtings.com/headphones', title: 'RTINGS Review' },
  ],
};

describe('formatResultMessage', () => {
  it('includes task title in the header', () => {
    expect(formatResultMessage(BASE_PARAMS)).toContain('Best headphones under $200');
  });

  it('includes agent name and QA verdict', () => {
    const msg = formatResultMessage(BASE_PARAMS);
    expect(msg).toContain('price-hunter');
    expect(msg).toContain('pass');
  });

  it('includes source links formatted as markdown', () => {
    const msg = formatResultMessage(BASE_PARAMS);
    expect(msg).toContain('https://amazon.com/dp/B09');
    expect(msg).toContain('Amazon - Sony WH-1000XM5');
  });

  it('stays within 2000 characters', () => {
    expect(formatResultMessage(BASE_PARAMS).length).toBeLessThanOrEqual(2000);
  });

  it('truncates long output to stay within 2000 chars', () => {
    const msg = formatResultMessage({ ...BASE_PARAMS, output: 'x'.repeat(2000) });
    expect(msg.length).toBeLessThanOrEqual(2000);
    expect(msg).toContain('truncated');
  });

  it('handles empty sources gracefully', () => {
    const msg = formatResultMessage({ ...BASE_PARAMS, sources: [] });
    expect(msg.length).toBeLessThanOrEqual(2000);
    expect(typeof msg).toBe('string');
  });

  it('shows QA_PASS_WITH_NOTES verdict label', () => {
    const msg = formatResultMessage({ ...BASE_PARAMS, qaVerdict: QAVerdict.PASS_WITH_NOTES });
    expect(msg).toContain('pass_with_notes');
  });
});
