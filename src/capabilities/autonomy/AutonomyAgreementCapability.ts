import { SeraTool } from '../../core/cognitive/Tool';

/** Creates a one-time approval proposal for an ongoing SERA operating intent. */
export class AutonomyAgreementCapability {
  public getTools(): SeraTool[] {
    return [{
      name: 'ACTIVATE_AUTONOMY_AGREEMENT',
      description: 'Create an Operating Agreement only when the user explicitly asks SERA to manage an ongoing intent or grants Full Access. It must be presented for one-time user approval before activation. Never use for a one-off request.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short visible name for the active intent.' },
          intent: { type: 'string', description: 'The ongoing outcome SERA will manage.' },
          mode: { type: 'string', enum: ['ASSISTANT', 'FULL_ACCESS'], description: 'Assistant proposes each action; Full Access authorizes actions covered by this agreement.' },
          permissions: { type: 'array', items: { type: 'string' }, minItems: 1, description: 'Explicit action names permitted by the agreement.' },
          nextActionSummary: { type: 'string', description: 'Plain-language condition or activity SERA will monitor.' }
        },
        required: ['title', 'intent', 'mode', 'permissions']
      },
      requiresApproval: true,
      irreversible: false,
      unsafe: false
    }];
  }
}
