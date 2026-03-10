import { Injectable, Logger } from '@nestjs/common';
import { FilterRule } from '../endpoints/schemas/endpoint.schema';

@Injectable()
export class FilterEngineService {
  private readonly logger = new Logger(FilterEngineService.name);

  /**
   * Evaluate all filter rules against an event payload.
   * Returns true if event should be delivered (all rules pass).
   * Empty rules = deliver everything.
   */
  evaluate(rules: FilterRule[], eventType: string, payload: Record<string, any>): boolean {
    if (!rules || rules.length === 0) return true;

    return rules.every(rule => this.evaluateRule(rule, eventType, payload));
  }

  private evaluateRule(rule: FilterRule, eventType: string, payload: Record<string, any>): boolean {
    const actualValue = this.getNestedValue({ eventType, payload }, rule.field);

    switch (rule.operator) {
      case 'eq':       return actualValue === rule.value;
      case 'neq':      return actualValue !== rule.value;
      case 'gt':       return typeof actualValue === 'number' && actualValue > rule.value;
      case 'lt':       return typeof actualValue === 'number' && actualValue < rule.value;
      case 'contains': return typeof actualValue === 'string' && actualValue.includes(rule.value);
      case 'exists':   return actualValue !== undefined && actualValue !== null;
      default:
        this.logger.warn(`Unknown filter operator: ${rule.operator}`);
        return true;
    }
  }

  /**
   * Get nested value from object using dot-notation path.
   * e.g. "payload.order.amount" → obj.payload.order.amount
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * Validate filter rules before saving (sanity check)
   */
  validateRules(rules: FilterRule[]): { valid: boolean; error?: string } {
    const validOperators = ['eq', 'neq', 'gt', 'lt', 'contains', 'exists'];
    for (const rule of rules) {
      if (!rule.field) return { valid: false, error: 'Rule field is required' };
      if (!validOperators.includes(rule.operator)) {
        return { valid: false, error: `Invalid operator: ${rule.operator}. Must be one of: ${validOperators.join(', ')}` };
      }
      if (rule.operator !== 'exists' && rule.value === undefined) {
        return { valid: false, error: `Rule value required for operator: ${rule.operator}` };
      }
    }
    return { valid: true };
  }
}
