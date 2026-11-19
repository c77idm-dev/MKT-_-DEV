import { configE2E } from './playwright.config';

/** e2e do modo Bitbrain (D4): o servidor e o worker sobem com ML_CONECTOR=bitbrain e o Bitbrain falso. `npm run test:e2e:bitbrain`. */
export default configE2E('bitbrain');
