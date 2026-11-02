(() => {
  const characters = {
    marlow: {
      name: 'Marlow', title: 'The Host',
      ears: '<path d="M22 42 17 10 42 29M78 42 83 10 58 29" />',
      innerEars: '<path d="m25 31-2-12 12 12m40 0 2-12-12 12" />',
      head: '<path d="M25 42 36 29h28l11 13-4 27-21 17-21-17z" />',
      muzzle: '<path d="M35 61q15-13 30 0l-4 10-11 5-11-5z" />',
      eyes: '<path d="M34 49q7-7 14 0m4 0q7-7 14 0" />',
      pupils: '<circle cx="41" cy="50" r="2.2"/><circle cx="59" cy="50" r="2.2"/>',
      tone: '#1e7650'
    },
    ivy: {
      name: 'Ivy', title: 'The Tactician',
      ears: '<path d="M22 42Q10 22 29 18q8 2 12 13m19 0q4-11 12-13 19 4 7 24" />',
      innerEars: '<path d="M24 33q-5-9 4-10l7 10m41 0q5-9-4-10l-7 10" />',
      head: '<path d="M22 45q0-24 28-24t28 24l-5 25-23 13-23-13z" />',
      muzzle: '<path d="m40 58 10 10 10-10-10-8z" />',
      eyes: '<circle cx="40" cy="49" r="8"/><circle cx="60" cy="49" r="8"/>',
      pupils: '<circle cx="41" cy="49" r="2.2"/><circle cx="59" cy="49" r="2.2"/>',
      tone: '#237b59'
    },
    rook: {
      name: 'Rook', title: 'The Veteran',
      ears: '<path d="M23 40q-10-17 4-21 11 0 14 13m22 0q3-13 14-13 14 4 4 21" />',
      innerEars: '<path d="M26 31q-4-8 2-8l7 9m39-1q4-8-2-8l-7 9" />',
      head: '<path d="M23 43q3-21 27-21t27 21l-4 28-23 11-23-11z" />',
      muzzle: '<path d="M34 61q16-10 32 0l-5 11-11 4-11-4z" />',
      eyes: '<path d="m33 49 14-2m6 0 14 2" />',
      pupils: '<circle cx="41" cy="50" r="2.2"/><circle cx="59" cy="50" r="2.2"/>',
      tone: '#176947'
    },
    pip: {
      name: 'Pip', title: 'The Trick Shot',
      ears: '<path d="M32 37Q18 20 29 5q16 4 17 31m8 0Q56 9 72 5q11 15-3 32" />',
      innerEars: '<path d="M34 28Q27 14 32 12q8 4 9 17m18-1q1-13 9-17 5 2-2 16" />',
      head: '<path d="M24 44q1-22 26-22t26 22l-5 27-21 12-21-12z" />',
      muzzle: '<path d="M35 60q15-11 30 0l-4 12-11 5-11-5z" />',
      eyes: '<path d="M34 49q7-6 14 0m4 0q7-6 14 0" />',
      pupils: '<circle cx="41" cy="49" r="2.2"/><circle cx="59" cy="49" r="2.2"/>',
      tone: '#27805a'
    },
    zara: {
      name: 'Zara', title: 'The Hustler',
      ears: '<path d="M26 38Q14 16 30 12q10 2 13 18m18 0q3-16 13-18 16 4 4 26" />',
      innerEars: '<path d="M28 28q-4-8 3-9l6 11m38-1q4-8-3-9l-6 11" />',
      head: '<path d="M24 44q2-23 26-23t26 23l-4 26-22 12-22-12z" />',
      muzzle: '<path d="M36 60q14-9 28 0l-4 11-10 5-10-5z" />',
      eyes: '<path d="M33 48q8-5 15 0m4 0q8-5 15 0" />',
      pupils: '<circle cx="41" cy="49" r="2.2"/><circle cx="59" cy="49" r="2.2"/>',
      tone: '#8b3a6e'
    },
    knox: {
      name: 'Knox', title: 'The Enforcer',
      ears: '<path d="M20 44 18 8 40 32M80 44 82 8 60 32" />',
      innerEars: '<path d="M22 30 21 14 34 28M78 30 79 14 66 28" />',
      head: '<path d="M22 44 34 30h32l12 14-5 26-23 13-23-13z" />',
      muzzle: '<path d="M34 62q16-11 32 0l-5 10-11 4-11-4z" />',
      eyes: '<path d="m32 49 15-1m6 0 15 1" />',
      pupils: '<circle cx="41" cy="50" r="2.5"/><circle cx="59" cy="50" r="2.5"/>',
      tone: '#2a4a8c'
    },
    lena: {
      name: 'Lena', title: 'The Sharpshooter',
      ears: '<path d="M28 36Q20 14 34 10q9 3 11 20m14 0q2-17 11-20 14 4 6 26" />',
      innerEars: '<path d="M30 26q-3-8 4-8l5 10m38-1q3-8-4-8l-5 10" />',
      head: '<path d="M25 45q1-24 25-24t25 24l-4 26-21 12-21-12z" />',
      muzzle: '<ellipse cx="50" cy="64" rx="12" ry="8"/>',
      eyes: '<circle cx="39" cy="48" r="7"/><circle cx="61" cy="48" r="7"/>',
      pupils: '<circle cx="40" cy="48" r="2.2"/><circle cx="60" cy="48" r="2.2"/>',
      tone: '#c47a2a'
    },
    dex: {
      name: 'Dex', title: 'The Wildcard',
      ears: '<path d="M30 35Q22 10 36 8q8 4 10 24m14 0q2-20 10-24 14 2 6 27" />',
      innerEars: '<path d="M32 24q-2-9 4-8l5 12m38-2q2-9-4-8l-5 12" />',
      head: '<path d="M26 46q0-25 24-25t24 25l-4 25-20 11-20-11z" />',
      muzzle: '<path d="M37 61q13-8 26 0l-3 10-10 5-10-5z" />',
      eyes: '<path d="M34 48q7-8 14 0m4 0q7-8 14 0" />',
      pupils: '<circle cx="41" cy="49" r="2.2"/><circle cx="59" cy="49" r="2.2"/>',
      tone: '#7a3a1e'
    }
  };
  const legacyIds = { A: 'marlow', K: 'ivy', Q: 'rook', J: 'pip' };
  let nextId = 0;

  function resolve(id) {
    const key = legacyIds[id] || id;
    return characters[key] ? { id: key, ...characters[key] } : { id: 'marlow', ...characters.marlow };
  }

  function render(id) {
    const character = resolve(id);
    const gradientId = `feltora-mascot-${++nextId}`;
    return `<svg class="mascot-art" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="${gradientId}" cx="35%" cy="24%" r="80%">
          <stop offset="0" stop-color="#28523b"/>
          <stop offset="1" stop-color="#0b1812"/>
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#${gradientId})"/>
      <circle cx="50" cy="50" r="45" fill="none" stroke="#d6a84b" stroke-width="1.5" opacity=".8"/>
      <path d="M17 100q3-25 20-30h26q17 5 20 30" fill="#102b1e" stroke="#d6a84b" stroke-width="2"/>
      <path d="M40 73l10 8 10-8 5 6-15 12-15-12z" fill="#d6a84b"/>
      <g fill="${character.tone}" stroke="#e0b955" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
        ${character.ears}
        ${character.head}
      </g>
      <g fill="#e0b955" opacity=".72">${character.innerEars}</g>
      <path d="M30 43q20-18 40 0l-3 25q-17 19-34 0z" fill="#14553a" opacity=".6"/>
      <g fill="none" stroke="#f4e3b2" stroke-width="2.4" stroke-linecap="round">${character.eyes}</g>
      <g fill="#f5e8c8">${character.pupils}</g>
      <g fill="#d8c99e" stroke="#e0b955" stroke-width="1.5" stroke-linejoin="round">${character.muzzle}</g>
      <path d="M47 64q3 3 6 0" fill="none" stroke="#45351d" stroke-width="1.6" stroke-linecap="round"/>
      <circle cx="50" cy="89" r="7" fill="#0a120e" stroke="#d6a84b" stroke-width="1.5"/>
      <text x="50" y="92" text-anchor="middle" fill="#f1d98c" font-size="7" font-family="Georgia,serif" font-weight="700">8</text>
      <path d="M22 76q-5 7-5 14m61-14q5 7 5 14" fill="none" stroke="#d6a84b" stroke-width="1" opacity=".65"/>
    </svg>`;
  }

  window.FeltoraMascots = Object.freeze({
    ids: Object.freeze(Object.keys(characters)),
    resolve,
    render
  });
})();
