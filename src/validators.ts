

import SFVChecker from './validators/SFVChecker';
import MissingSfv from './validators/MissingSfv';
import MissingNfo from './validators/MissingNfo';
import ExtraNfoSfv from './validators/ExtraNfoSfv';
import IncompleteRelease from './validators/IncompleteRelease';

const Validators = [
  SFVChecker,
  MissingSfv,
  MissingNfo,
  ExtraNfoSfv,
  IncompleteRelease,
];

export default Validators;