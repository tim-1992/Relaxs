const paths = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  leaf: '<path d="M20 4C10 2 3 8 5 15s15 9 15-11ZM5 21 16 10"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  spark: '<path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6z"/>',
  heart: '<path d="M20 5a5.5 5.5 0 0 0-8 1 5.5 5.5 0 0 0-8-1c-5 5 2 12 8 16 6-4 13-11 8-16Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
  moon: '<path d="M20 14A9 9 0 0 1 10 3a9 9 0 1 0 10 11Z"/>',
  box: '<path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 10v9M3 8l9 5 9-5M8 5l9 5"/>',
  wind: '<path d="M3 8h13a3 3 0 1 0-3-3M3 12h17a3 3 0 1 1-3 3M3 16h6a3 3 0 1 1-3 3"/>',
  cloud: '<path d="M7 18a5 5 0 1 1 0-10 7 7 0 0 1 13 3 3.5 3.5 0 0 1-1 7Z"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  steps: '<path d="M3 21v-6h6V9h6V3h6M3 21h18"/>',
  message: '<path d="M21 11a9 9 0 0 1-9 9 12 12 0 0 1-4-1l-5 2 1-5a9 9 0 1 1 17-5Z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 9M3 4v6h6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  play: '<path d="m8 4 12 8-12 8Z"/>',
  pause: '<path d="M8 4v16M16 4v16"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  flower: '<path d="M12 9C1-2 0 13 9 12 0 23 15 24 12 15c11 11 12-4 3-3 9-11-6-12-3-3Z"/><circle cx="12" cy="12" r="2"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M6 5q10 7 0 14M18 5q-10 7 0 14"/>',
  focus: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8 9v1m8-1v1m-9 4q5 6 10 0"/>',
};
export const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.spark}</svg>`;
export const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

let artId = 0;
export function artwork(type, className = '') {
  const id = `art-${artId++}`;
  const defs = `<defs>
    <linearGradient id="${id}-green" x2=".8" y2="1"><stop stop-color="#e0e9bf"/><stop offset="1" stop-color="#95b49a"/></linearGradient>
    <linearGradient id="${id}-clay" x2=".7" y2="1"><stop stop-color="#e3ceb0"/><stop offset="1" stop-color="#b69a7b"/></linearGradient>
    <linearGradient id="${id}-sky" x2="0" y2="1"><stop stop-color="#e3ebe3"/><stop offset="1" stop-color="#f1f0da"/></linearGradient>
    <radialGradient id="${id}-orb" cx=".3" cy=".2" r=".8"><stop stop-color="#e6efcd"/><stop offset=".7" stop-color="#b4cd99"/><stop offset="1" stop-color="#87a47c"/></radialGradient>
    <filter id="${id}-shadow" x="-50%" y="-50%" width="200%" height="220%"><feDropShadow dx="0" dy="9" stdDeviation="8" flood-color="#354b31" flood-opacity=".12"/></filter>
  </defs>`;
  const shadow = `filter="url(#${id}-shadow)"`;
  const green = `url(#${id}-green)`;
  const clay = `url(#${id}-clay)`;
  let content;
  switch (type) {
    case 'hero':
      content = `<circle cx="188" cy="124" r="107" fill="${green}" opacity=".25"/>
        <ellipse cx="181" cy="208" rx="121" ry="18" fill="#456448" opacity=".10"/>
        <path d="M53 176Q98 100 184 144T309 171L283 205Q180 241 62 203Z" fill="#d5dfba" ${shadow}/>
        <ellipse cx="169" cy="171" rx="55" ry="20" fill="#b5c79f"/>
        <ellipse cx="172" cy="158" rx="45" ry="23" fill="${clay}" ${shadow}/>
        <ellipse cx="168" cy="127" rx="36" ry="23" fill="#d2c7ad" ${shadow}/>
        <ellipse cx="175" cy="95" rx="28" ry="21" fill="#e3dac5" ${shadow}/>
        <path d="M177 77q-4-39 23-50c8 24-3 45-23 50Z" fill="#78986a"/>
        <path d="M175 83q-29-11-28-33c22 0 33 12 28 33Z" fill="#a4b785"/>
        <path d="M174 88q0-21 20-48" fill="none" stroke="#647d5c" stroke-width="2"/>
        <path d="M71 178q13-12 26-2m-8-13q11-10 20-2" stroke="#8eaa7b" fill="none" stroke-width="3" stroke-linecap="round"/>
        <circle cx="270" cy="77" r="23" fill="#f2dfad"/><path d="M49 84h30m-14-15v30M277 124h12m-6-6v12" stroke="#a2b293" stroke-width="2" stroke-linecap="round"/>
        <path d="M240 175q-6-25 8-40 14 22 1 43m1-18q10-15 23-12-3 15-21 22" fill="#9caf87"/>
        <ellipse cx="91" cy="202" rx="13" ry="6" fill="#aab98e"/><ellipse cx="270" cy="195" rx="17" ry="8" fill="#c7bd9f"/>`;
      break;
    case 'release':
      content = `<ellipse cx="160" cy="205" rx="76" ry="12" fill="#bba292" opacity=".15"/>
        <g ${shadow}><path d="M94 105h132l-12 94H108Z" fill="#c9a284"/><ellipse cx="160" cy="105" rx="67" ry="20" fill="#dbbba1"/><ellipse cx="160" cy="105" rx="49" ry="11" fill="#916d58"/><path d="M119 137q41 22 81 0" fill="none" stroke="#ae876d" stroke-width="2"/></g>
        <g transform="rotate(-18 160 75)"><rect x="129" y="40" width="61" height="63" rx="6" fill="#fcf6e8" ${shadow}/><path d="M142 57h34m-34 11h27m-27 11h30" stroke="#d9c1a2" stroke-width="3" stroke-linecap="round"/></g>
        <path d="m82 80 7 8m149-34-5 11m-12 15 10-2" stroke="#b89372" stroke-width="2.5" stroke-linecap="round"/>`;
      break;
    case 'breath':
      content = `<circle cx="160" cy="131" r="91" fill="#c7dada" opacity=".25"/><circle cx="160" cy="131" r="72" fill="none" stroke="#b9d0cb" stroke-width="1.5"/><circle cx="160" cy="131" r="54" fill="${green}" ${shadow}/><path d="M61 192q50-27 102 0t98 0M83 206q39-18 80 0t80 0" fill="none" stroke="#a6c0b7" stroke-width="2"/><path d="M145 129q6 8 12 0m9 0q6 8 12 0" fill="none" stroke="#657f6b" stroke-width="2" stroke-linecap="round"/>`;
      break;
    case 'cloud':
      content = `<circle cx="213" cy="80" r="36" fill="#eddeb2"/><g ${shadow}><path d="M96 169c-43-2-40-54-9-59-3-46 65-69 90-29 35-18 69 10 61 42 38 25 15 64-24 55Z" fill="#faf9ef"/></g><path d="M91 194q52 19 135 0" fill="none" stroke="#c6d1bb" stroke-width="2" stroke-dasharray="3 7"/><circle cx="116" cy="61" r="3" fill="#b5c4a2"/><path d="m254 96 3 6 7 1-6 4 1 7-5-4-6 2 2-6-3-5Z" fill="#b6c7a0"/>`;
      break;
    case 'action':
      content = `<ellipse cx="163" cy="209" rx="101" ry="10" fill="#afb39c" opacity=".12"/><g ${shadow}><path d="m63 181 45-12 32 15-44 12Z" fill="#d7cdb7"/><path d="m63 181 33 15v15l-33-13Z" fill="#baae96"/><path d="m96 196 44-12v16l-44 11Z" fill="#c6baa1"/><path d="m122 144 45-12 32 15-44 12Z" fill="#ccd8b5"/><path d="m122 144 33 15v37l-33-13Z" fill="#a4b08f"/><path d="m155 159 44-12v36l-44 13Z" fill="#b3c19d"/><path d="m185 101 45-12 31 15-44 12Z" fill="#b7cba4"/><path d="m185 101 32 15v60l-32-14Z" fill="#859d78"/><path d="m217 116 44-12v57l-44 15Z" fill="#9cb28c"/></g><path d="M225 92V51m0 0q18-9 29 3-12 13-29 8" fill="#c9a66b" stroke="#a2885e" stroke-width="2"/>`;
      break;
    case 'creature':
      content = `<ellipse cx="160" cy="206" rx="66" ry="12" fill="#9ea98a" opacity=".18"/><g ${shadow}><ellipse cx="107" cy="167" rx="15" ry="23" fill="#a3bb84" transform="rotate(25 107 167)"/><ellipse cx="214" cy="163" rx="13" ry="24" fill="#acc28d" transform="rotate(-24 214 163)"/><path d="M97 158q-2-38 25-48-19-42 9-50 22-8 30 31 35-21 55 13 26 42-2 80-34 38-83 15-32-12-34-41Z" fill="url(#${id}-orb)"/><ellipse cx="137" cy="193" rx="16" ry="11" fill="#9fb784"/><ellipse cx="183" cy="194" rx="15" ry="11" fill="#abc390"/></g><ellipse cx="138" cy="142" rx="13" ry="15" fill="#faf9ec"/><ellipse cx="178" cy="141" rx="13" ry="15" fill="#faf9ec"/><ellipse cx="140" cy="145" rx="5" ry="7" fill="#40513b"/><ellipse cx="176" cy="144" rx="5" ry="7" fill="#40513b"/><path d="M150 166q9 7 18-1" stroke="#617d4d" stroke-width="2" fill="none" stroke-linecap="round"/><ellipse cx="123" cy="161" rx="8" ry="4" fill="#d4b097" opacity=".6"/><ellipse cx="193" cy="160" rx="8" ry="4" fill="#d4b097" opacity=".6"/>`;
      break;
    case 'match':
      content = `<g ${shadow}><rect x="87" y="57" width="67" height="70" rx="16" fill="#f8f4e7" transform="rotate(-10 120 90)"/><rect x="170" y="62" width="67" height="70" rx="16" fill="#d2deb8" transform="rotate(9 204 97)"/><rect x="92" y="145" width="67" height="70" rx="16" fill="#dbcfb8" transform="rotate(5 125 179)"/><rect x="176" y="144" width="67" height="70" rx="16" fill="#f8f4e7" transform="rotate(-8 210 179)"/></g><path d="M118 110q-17-34 11-41 14 30-11 41Zm89 91q-17-34 11-41 14 30-11 41Z" fill="#9aae83"/><circle cx="204" cy="96" r="15" fill="#eef2df"/><path d="m115 179 10-15 11 15-11 15Z" fill="#f5eddb"/>`;
      break;
    case 'reframe':
      content = `<g ${shadow}><rect x="71" y="94" width="90" height="99" rx="17" fill="#cfbda8" transform="rotate(-12 116 144)"/><rect x="143" y="54" width="99" height="130" rx="17" fill="#fbf7eb" transform="rotate(9 192 119)"/></g><circle cx="191" cy="101" r="23" fill="#d9dfc2"/><path d="m179 106 12-19 13 19Z" fill="#a5b289"/><path d="m172 143 37 6m-39 4 28 4" stroke="#cec9b7" stroke-width="3" stroke-linecap="round"/><path d="m83 80 5-11m169 120 12 3" stroke="#c5b08b" stroke-width="2.5"/>`;
      break;
    case 'support':
      content = `<g ${shadow}><rect x="83" y="86" width="160" height="112" rx="13" fill="#ead3c1" transform="rotate(-6 163 141)"/><path d="m83 90 83 62 75-80" fill="#f1dece"/><path d="m94 191 51-54m89 40-47-46" stroke="#d8bca7" stroke-width="2"/></g><path d="M153 102c-42-17-20-47 2-29 21-23 46 6-2 29Z" fill="#b67e6d" transform="rotate(10 153 89)"/><path d="m244 57 5 9 10 1-8 7 2 10-9-5-9 5 2-11-7-7 10-1Z" fill="#c9b787"/>`;
      break;
    case 'zen':
      content = `<ellipse cx="160" cy="206" rx="66" ry="12" fill="#9ea98a" opacity=".14"/><path d="M160 200v-66m0 41q-35 5-43-29 34-3 43 29m0-13q32 1 40-26-29-4-40 26" fill="#a6ba8d" stroke="#8ca578" stroke-width="2"/><g ${shadow}><ellipse cx="160" cy="97" rx="18" ry="35" fill="#ecd2ba"/><ellipse cx="137" cy="119" rx="18" ry="35" fill="#e6bfa5" transform="rotate(-55 137 119)"/><ellipse cx="183" cy="119" rx="18" ry="35" fill="#efcfb4" transform="rotate(55 183 119)"/><ellipse cx="151" cy="134" rx="17" ry="29" fill="#f5debd" transform="rotate(-145 151 134)"/><ellipse cx="174" cy="134" rx="17" ry="29" fill="#ebc7a7" transform="rotate(145 174 134)"/><circle cx="160" cy="122" r="18" fill="#d6b366"/></g>`;
      break;
    case 'basketball':
      content = `<ellipse cx="163" cy="213" rx="92" ry="10" fill="#bba286" opacity=".12"/><rect x="183" y="49" width="11" height="162" rx="4" fill="#d3c6b1"/><rect x="139" y="45" width="99" height="67" rx="8" fill="#fbf7ec" stroke="#d4c5ac" stroke-width="3"/><rect x="170" y="66" width="37" height="29" rx="3" stroke="#c8b49a" stroke-width="2"/><path d="m166 109 11 43h22l12-43m-39 15h33m-28 14h23m-17-27 1 41m14-41-5 41" stroke="#d6caba" stroke-width="2"/><ellipse cx="188" cy="109" rx="29" ry="6" stroke="#bd8864" stroke-width="4"/><g ${shadow}><circle cx="110" cy="169" r="38" fill="#d7a16e"/><path d="M73 167h74m-36-35v74m-24-64q46 30 0 53m47-53q-43 31 0 53" stroke="#af7855" stroke-width="2" fill="none"/></g>`;
      break;
    case 'football':
      content = `<path d="m50 194 58-70h125l51 70Z" fill="#d4e0bf"/><path d="m119 128 0-59h113v73m-110-68 28 53m-5-53 22 54m1-54 20 54m3-54 17 54m4-54 15 54M122 89h108m-104 19h104" stroke="#a5b994" stroke-width="2"/><path d="M112 144V62h125v82" stroke="#fdfced" stroke-width="7" stroke-linejoin="round"/><g ${shadow}><circle cx="124" cy="172" r="38" fill="#faf8e9"/><path d="m124 151 20 14-8 24h-25l-8-24Zm-7-16-8 17m37-6-3 20m17 13-25 10m-8 20-8-20m-28-28 14 5" fill="#71856a" stroke="#71856a" stroke-width="3"/></g>`;
      break;
    case 'tennis':
      content = `<ellipse cx="168" cy="214" rx="78" ry="10" fill="#9dba81" opacity=".12"/><g transform="rotate(28 176 125)" ${shadow}><rect x="166" y="154" width="20" height="70" rx="8" fill="#bfa487"/><path d="m168 165-14-40h44l-15 40" stroke="#a8b597" stroke-width="4"/><ellipse cx="176" cy="96" rx="41" ry="59" fill="#e7edd6" stroke="#9dab88" stroke-width="6"/><path d="M145 60v72m13-86v100m13-108v116m13-115v111m13-104v91m13-78v59M140 70h71m-77 13h83m-84 13h85m-81 13h79m-71 13h65m-54 13h43" stroke="#c3ceae" stroke-width="1.5"/></g><circle cx="106" cy="169" r="27" fill="#d5df85" ${shadow}/><path d="M91 147q26 24 0 42m31-38q-24 20-2 41" stroke="#faf8d7" stroke-width="3"/>`;
      break;
    case 'target':
      content = `<circle cx="167" cy="124" r="73" fill="#dfebe5" stroke="#c2d5cb" stroke-width="2" ${shadow}/><circle cx="167" cy="124" r="52" fill="#bcd1c5"/><circle cx="167" cy="124" r="31" fill="#eef3de"/><circle cx="167" cy="124" r="12" fill="#95b49f"/><path d="m165 122 77-71m-8 18 13-5 1-17-17 1-5 13" stroke="#b59c77" stroke-width="5" stroke-linecap="round"/><circle cx="68" cy="77" r="13" fill="#e1e7cb"/><circle cx="76" cy="185" r="20" fill="#f0ddbe"/><circle cx="260" cy="175" r="9" fill="#c7d8d0"/>`;
      break;
    case 'dodge':
      content = `<path d="M60 209h209" stroke="#d8d6bf" stroke-width="2"/><rect x="80" y="62" width="30" height="32" rx="9" fill="#cfb898" transform="rotate(20 95 78)"/><rect x="221" y="113" width="34" height="36" rx="10" fill="#b8c69f" transform="rotate(-15 238 130)"/><path d="m170 47 4 13 15 1-11 9 3 14-12-7-12 8 2-15-11-8 14-1Z" fill="#d8c685"/><g ${shadow}><path d="M119 170q-6-38 29-44t42 32v34q-36 30-73 1Z" fill="${green}"/><circle cx="141" cy="157" r="4" fill="#6f855b"/><circle cx="166" cy="157" r="4" fill="#6f855b"/><path d="M146 173q7 6 14-1" stroke="#7b9164" stroke-width="2" stroke-linecap="round"/></g><path d="m83 174-15 7 16 8m136-14 15 7-16 7" stroke="#b8b796" stroke-width="2.5" stroke-linecap="round"/>`;
      break;
    case 'prank':
      content = `<ellipse cx="163" cy="218" rx="71" ry="9" fill="#bba286" opacity=".12"/><path d="m158 174-13 9 29 8-29 9 22 8" stroke="#b3aa96" stroke-width="5" stroke-linecap="round"/><g ${shadow}><path d="M113 132q-12-49 40-58 52-9 60 37 7 39-30 66-56 10-70-45Z" fill="#dbb89d"/><path d="m124 86 25-49 41 43Z" fill="#b3c09a"/><circle cx="149" cy="37" r="8" fill="#d5c172"/><ellipse cx="140" cy="116" rx="7" ry="11" fill="#faf7e8"/><ellipse cx="181" cy="116" rx="7" ry="11" fill="#faf7e8"/><circle cx="141" cy="119" r="3" fill="#6d7460"/><circle cx="180" cy="119" r="3" fill="#6d7460"/><path d="M145 150q16 13 29-1" stroke="#a17c60" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M106 135q-29 0-25 21 0 15 24 14 6 21 27 11 21-12 7-31-3-21-33-15Z" fill="#faf8ee"/></g>`;
      break;
    default: content = `<circle cx="160" cy="125" r="65" fill="${green}"/>`;
  }
  return `<svg class="artwork ${className}" viewBox="0 0 320 250" fill="none" aria-hidden="true">${defs}${content}</svg>`;
}
