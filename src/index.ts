import 'source-map-support/register';

import { ManagedExtension } from 'airdcpp-extension';
import Entry from './main';

process.removeAllListeners('warning');
process.on('warning', (warning: any) => {
  if (warning.code === 'DEP0169') {
    return;
  }
  console.error(warning.stack || `${warning.name}: ${warning.message}`);
});

ManagedExtension(Entry, {

});
