import {
  PredicateAgent,
  PredicateBrowser,
  PredicateDebugger,
  PredicateVisualAgent,
  SentienceAgent,
  SentienceBrowser,
  SentienceDebugger,
  SentienceVisualAgent,
  backends,
} from '../src';

describe('Predicate rebrand aliases', () => {
  it('aliases browser constructor', () => {
    expect(PredicateBrowser).toBe(SentienceBrowser);
  });

  it('aliases agent constructor', () => {
    expect(PredicateAgent).toBe(SentienceAgent);
  });

  it('aliases visual agent constructor', () => {
    expect(PredicateVisualAgent).toBe(SentienceVisualAgent);
  });

  it('aliases debugger constructor', () => {
    expect(PredicateDebugger).toBe(SentienceDebugger);
  });

  it('exports backend PredicateContext alias', () => {
    expect(backends.PredicateContext).toBe(backends.SentienceContext);
  });
});
