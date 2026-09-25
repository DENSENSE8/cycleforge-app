import { TRIAL_NAMES } from '@cycleforge/design-tokens';

/** Applies the first valid URL-selected trial — one open trial per page; never reads or writes storage. */
export const TRIAL_BOOT_SCRIPT =
  `try{var q=new URLSearchParams(location.search),raw=q.get('trial')||'',` +
  `valid=${JSON.stringify(TRIAL_NAMES)},names=raw.split(',').map(function(n){return n.trim();})` +
  `.filter(function(n){return valid.indexOf(n)>-1;});` +
  `names=names.slice(0,1);` +
  `if(names.length)document.documentElement.setAttribute('data-trial',names.join(' '));` +
  `}catch(e){}`;
