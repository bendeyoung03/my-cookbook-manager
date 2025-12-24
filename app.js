// ====== Config ======
const OCR_ENABLED = false; // OCR is OFF (and UI removed)

// ====== Global state ======
let db;
let state = {
  screen: 'recipes', // 'recipes' | 'add' | 'settings' | 'edit' | 'recipe'
  search: '',
  categories: [],
  recipes: [],
  groceryMode: true,
  favoritesCollapsed: false,
  cookbookName: 'My Cookbook',
  theme: 'charcoal',
  editingId: null,
  viewingId: null,
};

// ====== Add flow draft photos (kept in-memory only) ======
let addManualPhotoBlobs = [];
let addPhotoOnlyBlobs = [];


// ====== Boot ======
(async function init() {
  db = await openDB();
  await ensureSeed();
  await loadAll();

  applyTheme(state.theme);
  setTopTitleFromState();

  const hasPrompted = await getSetting(db, 'hasPromptedCookbookName', false);
  if (!hasPrompted) {
    const name = prompt('Name your cookbook:', 'My Cookbook');
    if (name && name.trim()) {
      state.cookbookName = name.trim();
      await setSetting(db, 'cookbookName', state.cookbookName);
    } else {
      state.cookbookName = 'My Cookbook';
      await setSetting(db, 'cookbookName', state.cookbookName);
    }
    await setSetting(db, 'hasPromptedCookbookName', true);
    setTopTitleFromState();
  }

  render();
})();

async function ensureSeed() {
  const cats = await getAll(db, Stores.categories);
  if (cats.length) return;

  const main = { id: uuid(), name: 'Main', order: 0 };
  const dessert = { id: uuid(), name: 'Dessert', order: 1 };
  await putOne(db, Stores.categories, main);
  await putOne(db, Stores.categories, dessert);

  const sample1 = {
    id: uuid(),
    title: 'Chicken Alfredo',
    categoryId: main.id,
    isFavorite: true,
    isPhotoOnly: false,
    ingredients: [
      { id: uuid(), text: '1 lb chicken', checked: false },
      { id: uuid(), text: '1 jar Alfredo sauce', checked: false },
    ],
    instructions: ['Boil pasta', 'Cook chicken', 'Combine'],
    photos: [],
    createdAt: Date.now(),
  };
  await putOne(db, Stores.recipes, sample1);

  await setSetting(db, 'favoritesCollapsed', false);
  await setSetting(db, 'groceryMode', true);
  await setSetting(db, 'cookbookName', 'My Cookbook');
  await setSetting(db, 'theme', 'charcoal');
}

async function loadAll() {
  state.categories = (await getAll(db, Stores.categories)).sort((a, b) => a.order - b.order);
  state.recipes = await getAll(db, Stores.recipes);
  state.groceryMode = await getSetting(db, 'groceryMode', true);
  state.favoritesCollapsed = await getSetting(db, 'favoritesCollapsed', false);
  state.cookbookName = await getSetting(db, 'cookbookName', 'My Cookbook');
  state.theme = await getSetting(db, 'theme', 'charcoal');
}

function applyTheme(themeName) {
  document.body.setAttribute('data-theme', themeName);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute(
      'content',
      (themeName === 'pearl') ? '#f5f3ee' :
      (themeName === 'butter') ? '#fbf3d6' :
      (themeName === 'sky') ? '#e9f4ff' :
      '#0b0b0d'
    );
  }
}

function setTopTitleFromState() {
  const topTitle = document.getElementById('topTitle');
  if (topTitle) topTitle.textContent = state.cookbookName || 'My Cookbook';
}

// ====== Rendering ======
function render() {
  const main = document.getElementById('main');
  const topTitle = document.getElementById('topTitle');
  const topLeft = document.getElementById('topLeft');
  const topActions = document.getElementById('topActions');

  topLeft.innerHTML = '';
  topActions.innerHTML = '';

  // ===== Title + actions =====
  if (state.screen === 'recipes') {
    topTitle.textContent = state.cookbookName || 'My Cookbook';
    topActions.appendChild(iconButton('＋', 'Add recipe', () => { state.screen = 'add'; render(); }));
    topActions.appendChild(iconButton('⚙', 'Settings', () => { state.screen = 'settings'; render(); }));
  }
  else if (state.screen === 'recipe') {
    const r = state.recipes.find(x => x.id === state.viewingId);
    const title = (r?.title || 'Recipe').trim() || 'Recipe';
    const catName = state.categories.find(c => c.id === r?.categoryId)?.name || '';
    const ingCount = r?.isPhotoOnly ? 0 : ((r?.ingredients || []).length);

    // Per your request: recipe name + category + # ingredients in the top header
    topTitle.textContent = `${title}`;

    topLeft.appendChild(backButton('←', 'Back', () => {
      state.screen = 'recipes';
      state.viewingId = null;
      render();
    }));

    // Move star + edit into the top banner
    const star = r?.isFavorite ? '★' : '☆';
    topActions.appendChild(iconButton(star, 'Toggle favorite', async () => {
      if (!r) return;
      r.isFavorite = !r.isFavorite;
      await putOne(db, Stores.recipes, r);
      await loadAll();
      render();
    }));
    topActions.appendChild(iconButton('✎', 'Edit recipe', () => {
      if (!r) return;
      state.editingId = r.id;
      state.screen = 'edit';
      render();
    }));
  }
  else if (state.screen === 'edit') {
    topTitle.textContent = 'Edit Recipe';
    topLeft.appendChild(backButton('←', 'Back', () => {
      // go back to recipe view
      state.screen = 'recipe';
      state.editingId = null;
      render();
    }));
  }
  else if (state.screen === 'add') {
    topTitle.textContent = 'Add Recipe';
    topLeft.appendChild(backButton('←', 'Back', () => {
      state.screen = 'recipes';
      render();
    }));
  }
  else {
    topTitle.textContent = 'Settings';
    topLeft.appendChild(backButton('←', 'Back', () => {
      state.screen = 'recipes';
      render();
    }));
  }

  // ===== Body =====
  if (state.screen === 'recipes') {
    main.innerHTML = recipesScreenHTML();
    bindRecipesScreen();
  } else if (state.screen === 'add') {
    main.innerHTML = addScreenHTML();
    bindAddScreen();
  } else if (state.screen === 'edit') {
    const r = state.recipes.find(x => x.id === state.editingId);
    main.innerHTML = editScreenHTML(r);
    bindEditScreen(r);
  } else if (state.screen === 'recipe') {
    const r = state.recipes.find(x => x.id === state.viewingId);
    main.innerHTML = recipeFullScreenHTML(r);
    bindRecipeFullScreen(r);
  } else {
    main.innerHTML = settingsScreenHTML();
    bindSettingsScreen();
  }
}

function iconButton(text, aria, onClick) {
  const b = document.createElement('button');
  b.className = 'icon-btn';
  b.type = 'button';
  b.textContent = text;
  b.setAttribute('aria-label', aria);
  b.addEventListener('click', onClick);
  return b;
}

function backButton(text, aria, onClick) {
  const b = document.createElement('button');
  b.className = 'back-btn';
  b.type = 'button';
  b.textContent = text;
  b.setAttribute('aria-label', aria);
  b.addEventListener('click', onClick);
  return b;
}

// ====== Recipes Screen ======
function recipesScreenHTML() {
  return `
    <div class="card">
      <div class="label">Search</div>
      <input
        class="input"
        id="search"
        placeholder="Search by name or ingredient"
        value="${escapeAttr(state.search)}"
      />
    </div>

    <div id="recipesContent">
      ${renderFavoritesSection()}
      ${state.categories.map(c => renderCategorySection(c)).join('')}
    </div>
  `;
}

function rerenderRecipesOnly() {
  const container = document.getElementById('recipesContent');
  if (!container) return;

  container.innerHTML = `
    ${renderFavoritesSection()}
    ${state.categories.map(c => renderCategorySection(c)).join('')}
  `;

  // Rebind favorites collapse/expand button (if present)
  const toggleFav = document.getElementById('toggleFav');
  if (toggleFav) {
    toggleFav.onclick = async () => {
      state.favoritesCollapsed = !state.favoritesCollapsed;
      await setSetting(db, 'favoritesCollapsed', state.favoritesCollapsed);
      rerenderRecipesOnly();
    };
  }

  // Rebind recipe clicks (same behavior as bindRecipesScreen)
document.querySelectorAll('[data-open-recipe]').forEach(el => {
  el.onclick = () => {
    state.viewingId = el.dataset.openRecipe;
    state.screen = 'recipe';
    render();
  };
});

}



function rerenderRecipesContentOnly() {
  const host = document.getElementById('recipesContent');
  if (!host) return;

  host.innerHTML = `
    ${renderFavoritesSection()}
    ${state.categories.map(c => renderCategorySection(c)).join('')}
  `;

  // Rebind favorites collapse button
  const toggleFav = document.getElementById('toggleFav');
  if (toggleFav) {
    toggleFav.onclick = async () => {
      state.favoritesCollapsed = !state.favoritesCollapsed;
      await setSetting(db, 'favoritesCollapsed', state.favoritesCollapsed);
      rerenderRecipesContentOnly();
    };
  }

  // Rebind recipe open clicks
  document.querySelectorAll('[data-open-recipe]').forEach(el => {
    el.onclick = () => openRecipe(el.dataset.openRecipe); // <-- CHANGE THIS LINE IF NEEDED (see below)
  });
}



function renderFavoritesSection() {
  const favs = filteredRecipes().filter(r => r.isFavorite);
  if (!favs.length) return '';

  const arrow = state.favoritesCollapsed ? '▸' : '▾';

  return `
    <div class="section-title">Favorites</div>
    <div class="card">
      <div class="row-between">
        <div class="item-title">Favorites</div>
        <button class="btn btn-icon" id="toggleFav" aria-label="Toggle favorites">${arrow}</button>
      </div>
      ${state.favoritesCollapsed ? '' : `
        <div class="hr"></div>
        <div class="list">${favs.map(r => recipeRowHTML(r)).join('')}</div>
      `}
    </div>
  `;
}

function renderCategorySection(category) {
  // Favorites STAY in the category list too
  const items = filteredRecipes().filter(r => r.categoryId === category.id);
  if (!items.length) return '';

  items.sort((a, b) => (a.title || '~').localeCompare((b.title || '~'), undefined, { sensitivity: 'base' }));

  return `
    <div class="section-title">${escapeHTML(category.name)}</div>
    <div class="card">
      <div class="list">
        ${items.map(r => recipeRowHTML(r)).join('')}
      </div>
    </div>
  `;
}

function recipeRowHTML(r) {
  const hasPhoto = r.photos && r.photos.length;

  // Use first photo as preview thumbnail
  const thumbHTML = hasPhoto
    ? `<img class="rowthumb" src="${URL.createObjectURL(r.photos[0])}" alt="" />`
    : `<div class="rowthumb rowthumb--placeholder" aria-hidden="true">🍽️</div>`;

  return `
    <div class="item" data-open-recipe="${r.id}">
      ${thumbHTML}
      <div style="min-width:0; flex:1">
        <div class="item-title">${escapeHTML(r.title || 'Untitled')}</div>
        <div class="badge">${r.isPhotoOnly ? 'Photo-only' : `${(r.ingredients || []).length} ingredients`}${r.isFavorite ? ' • ★' : ''}</div>
      </div>
      <div class="badge">›</div>
    </div>
  `;
}


function bindRecipesScreen() {
  const search = document.getElementById('search');
  search.addEventListener('input', () => {
  state.search = search.value;
  rerenderRecipesOnly();
});



  const toggleFav = document.getElementById('toggleFav');
  if (toggleFav) {
    toggleFav.addEventListener('click', async () => {
      state.favoritesCollapsed = !state.favoritesCollapsed;
      await setSetting(db, 'favoritesCollapsed', state.favoritesCollapsed);
      render();
    });
  }

  document.querySelectorAll('[data-open-recipe]').forEach(el => {
    el.addEventListener('click', () => {
      state.viewingId = el.dataset.openRecipe;
      state.screen = 'recipe';
      render();
    });
  });
}

function filteredRecipes() {
  const q = state.search.trim().toLowerCase();
  if (!q) return [...state.recipes];

  return state.recipes.filter(r => {
    const inTitle = (r.title || '').toLowerCase().includes(q);
    const inIng = (r.ingredients || []).some(i => (i.text || '').toLowerCase().includes(q));
    return inTitle || inIng;
  });
}

// ====== Full Screen Recipe View (UPDATED PER YOUR REQUEST) ======
function recipeFullScreenHTML(r) {
  if (!r) {
    return `<div class="card"><div class="item-title">Recipe not found.</div></div>`;
  }

  // Small photo banner (not huge). Tap to enlarge.
    // Photo banner + optional thumbnail strip. Tap any to open gallery.
  const photos = (r.photos || []);
  const banner = photos.length
    ? `
      <div class="recipe-banner">
        <img src="${URL.createObjectURL(photos[0])}" alt="Recipe photo" data-open-photo="0" />
      </div>
      ${photos.length > 1 ? `
  <div class="photo-strip" aria-label="Additional recipe photos">
    ${photos.slice(1).map((b, i) => {
      const idx = i + 1; // real index in r.photos
      return `<img class="stripthumb" src="${URL.createObjectURL(b)}" alt="Recipe photo ${idx + 1}" data-open-photo="${idx}" />`;
    }).join('')}
  </div>
` : ''}

    `
    : '';


  const ingredientsHTML = r.isPhotoOnly
    ? `<div class="small">This is a photo-only recipe.</div>`
    : (state.groceryMode
      ? `
        <div class="section-title" style="margin-top:0">Ingredients</div>
        <div class="list">
          ${(r.ingredients || []).map(i => `
            <div class="item" style="justify-content:flex-start">
              <input class="checkbox" type="checkbox" data-check-ing="${i.id}" ${i.checked ? 'checked' : ''} />
              <div style="min-width:0">${escapeHTML(i.text)}</div>
            </div>
          `).join('')}
        </div>
        <div style="margin-top:10px">
          <button class="btn" id="resetRecipeChecks">Reset Ingredients</button>
        </div>
      `
      : `
        <div class="section-title" style="margin-top:0">Ingredients</div>
        <ul class="bullets">
          ${(r.ingredients || []).map(i => `<li>${escapeHTML(i.text)}</li>`).join('')}
        </ul>
      `
    );

  const instructionsHTML = (!r.isPhotoOnly && (r.instructions || []).length)
    ? `
      <div class="hr"></div>
      <div class="section-title">Instructions</div>
      <ol class="steps">
        ${(r.instructions || []).map(step => `<li>${escapeHTML(step)}</li>`).join('')}
      </ol>
    `
    : '';

  // NOTE: removed the “random” top card section entirely.
  // Now it’s just: optional small banner + ingredients + instructions.
  return `
    ${banner}
    <div class="card">
      ${ingredientsHTML}
      ${instructionsHTML}
    </div>
  `;
}

function bindRecipeFullScreen(r) {
  if (!r) return;

  // reset per-recipe checks (no confirmation)
  const resetBtn = document.getElementById('resetRecipeChecks');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      (r.ingredients || []).forEach(i => i.checked = false);
      await putOne(db, Stores.recipes, r);
      await loadAll();
      render();
    });
  }

  // ingredient checks
  document.querySelectorAll('[data-check-ing]').forEach(el => {
    el.addEventListener('change', async () => {
      const ingId = el.dataset.checkIng;
      const ing = r.ingredients.find(i => i.id === ingId);
      if (!ing) return;
      ing.checked = el.checked;
      await putOne(db, Stores.recipes, r);
      await loadAll();
    });
  });

    // tap any photo (banner or strip) to open gallery
  document.querySelectorAll('[data-open-photo]').forEach(el => {
    el.addEventListener('click', () => {
      const idx = Number(el.dataset.openPhoto);
      const blobs = r.photos || [];
      if (!blobs.length) return;
      openPhotoViewerGallery(blobs, idx);
    });
  });
}

function openPhotoViewer(blob) {
  // Backward-compatible single-photo viewer
  openPhotoViewerGallery([blob], 0);
}

function openPhotoViewerGallery(blobs, startIndex = 0) {
  if (!blobs || !blobs.length) return;

  let idx = Math.max(0, Math.min(startIndex, blobs.length - 1));
  let currentUrl = null;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const modal = document.createElement('div');
  modal.className = 'modal';

  modal.innerHTML = `
  <div class="row-between" style="margin-bottom:10px">
    <div class="item-title">Photo <span class="small" id="photoCount"></span></div>
    <button class="btn" id="close">Done</button>
  </div>

    <div class="modal-photo-wrap">
    <img class="full" id="photoImg" alt="Photo" />
  </div>

  <div class="photo-dots" id="photoDots" aria-hidden="true"></div>
`;

  function renderAt(i) {
  idx = i;
  const img = modal.querySelector('#photoImg');
  const count = modal.querySelector('#photoCount');
  const dotsHost = modal.querySelector('#photoDots');

  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = URL.createObjectURL(blobs[idx]);
  img.src = currentUrl;

  count.textContent = `(${idx + 1}/${blobs.length})`;

  // ----- dot indicators -----
  dotsHost.innerHTML = blobs.map((_, d) =>
    `<span class="photo-dot ${d === idx ? 'active' : ''}"></span>`
  ).join('');
}


  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      backdrop.remove();
    }
  });

  modal.querySelector('#close').addEventListener('click', () => {
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    backdrop.remove();
  });

  // Keyboard support (nice on laptop)
  window.addEventListener('keydown', function onKey(e) {
    if (!document.body.contains(backdrop)) {
      window.removeEventListener('keydown', onKey);
      return;
    }
    if (e.key === 'ArrowLeft' && idx > 0) renderAt(idx - 1);
    if (e.key === 'ArrowRight' && idx < blobs.length - 1) renderAt(idx + 1);
    if (e.key === 'Escape') modal.querySelector('#close').click();
  });

  renderAt(idx);
    // Swipe support (touch)
  let startX = null;
  const imgEl = modal.querySelector('#photoImg');

  imgEl.addEventListener('touchstart', (e) => {
    startX = e.touches?.[0]?.clientX ?? null;
  }, { passive: true });

  imgEl.addEventListener('touchend', (e) => {
    if (startX === null) return;
    const endX = e.changedTouches?.[0]?.clientX ?? startX;
    const dx = endX - startX;
    startX = null;

    // threshold
    if (Math.abs(dx) < 40) return;

    if (dx > 0 && idx > 0) renderAt(idx - 1);           // swipe right -> prev
    if (dx < 0 && idx < blobs.length - 1) renderAt(idx + 1); // swipe left -> next
  }, { passive: true });

}


// ====== Add Screen (OCR removed) ======
function addScreenHTML() {
  return `
    <div class="card">
      <div class="section-title" style="margin-top:0">Choose how to add</div>
      <div class="list">
        <button class="btn" id="addManual">Add Manually</button>
        <button class="btn" id="addPhotoOnly">Add with Photo</button>
      </div>
    </div>

    <div id="addFlow"></div>
  `;
}

function bindAddScreen() {
  const host = document.getElementById('addFlow');

    document.getElementById('addManual').onclick = () => {
    setAddModeActive('manual');
    host.innerHTML = manualFormHTML({ mode: 'manual' });
    bindManualForm({ mode: 'manual' });
  };

  document.getElementById('addPhotoOnly').onclick = () => {
    setAddModeActive('photo');
    host.innerHTML = photoOnlyFormHTML({});
    bindPhotoOnlyForm();
  };

setAddModeActive('manual');

}

function setAddModeActive(mode){
  const m = document.getElementById('addManual');
  const p = document.getElementById('addPhotoOnly');
  if (!m || !p) return;

  m.classList.toggle('btn-primary', mode === 'manual');
  p.classList.toggle('btn-primary', mode === 'photo');
}


// ====== Edit Screen ======
function editScreenHTML(r) {
  if (!r) {
    return `<div class="card"><div class="item-title">Recipe not found.</div></div>`;
  }

  const ingredientsText = (r.ingredients || []).map(i => i.text).join('\n');
  const instructionsText = (r.instructions || []).join('\n');

    const photoStrip = (r.photos && r.photos.length)
    ? `
      <div class="section-title" style="margin-top:0">Current Photos</div>
      <div class="row" style="flex-wrap:wrap">
        ${r.photos.map((blob, idx) => {
          const url = URL.createObjectURL(blob);
          return `
            <div style="position:relative">
              <img class="thumb" src="${url}" alt="photo" />
              <button class="photo-del" type="button" data-remove-photo="${idx}" aria-label="Remove photo">✕</button>
            </div>
          `;
        }).join('')}
      </div>

      <div class="label" style="margin-top:12px">Add photo(s) (optional)</div>
      <input class="input" id="e_photo" type="file" accept="image/*" multiple />

      <div class="hr"></div>
    `
    : '';

  const defaultCat = r.categoryId || (state.categories[0]?.id || '');

  return `
    <div class="card">
      ${photoStrip}

      <div class="label">Title</div>
      <input class="input" id="e_title" placeholder="Recipe name" value="${escapeAttr(r.title || '')}" />

      <div class="label">Category</div>
      <select class="select" id="e_category">${categoryOptionsHTML(defaultCat)}</select>

            ${(!r.photos || !r.photos.length) ? `
        <div class="label">Add photo(s) (optional)</div>
        <input class="input" id="e_photo" type="file" accept="image/*" multiple />
      ` : ''}

      <div class="label">Ingredients (one per line)</div>
      <textarea class="textarea" id="e_ingredients">${escapeHTML(ingredientsText)}</textarea>

      <div class="label">Instructions (one step per line)</div>
      <textarea class="textarea" id="e_instructions">${escapeHTML(instructionsText)}</textarea>

      <div class="hr"></div>
      <div class="row">
        <button class="btn btn-primary" id="e_save">Save</button>
        <button class="btn btn-danger" id="e_delete">Delete Recipe</button>
      </div>
    </div>
  `;
}

function bindEditScreen(r) {
  if (!r) return;

  document.querySelectorAll('[data-remove-photo]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = Number(btn.dataset.removePhoto);
      r.photos.splice(idx, 1);
      await putOne(db, Stores.recipes, r);
      await loadAll();
      render();
    });
  });

  let newPhotoBlobs = [];
const fileEl = document.getElementById('e_photo');
fileEl.onchange = async () => {
  const files = Array.from(fileEl.files || []);
  if (!files.length) return;
  newPhotoBlobs = [];
  for (const f of files) {
    newPhotoBlobs.push(await fileToJpegBlob(f));
  }
};


  document.getElementById('e_save').onclick = async () => {
    const title = document.getElementById('e_title').value.trim();
    const categoryId = document.getElementById('e_category').value;

    const ingredients = document.getElementById('e_ingredients').value
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
      .map(text => {
        const existing = (r.ingredients || []).find(i => (i.text || '').trim() === text);
        return existing ? { ...existing, text } : { id: uuid(), text, checked: false };
      });

    const instructions = document.getElementById('e_instructions').value
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);

    r.title = title;
    r.categoryId = categoryId;
    r.ingredients = ingredients;
    r.instructions = instructions;

    if (newPhotoBlobs.length) {
      r.photos = r.photos || [];
      r.photos.push(...newPhotoBlobs);
      newPhotoBlobs = [];
    }


    await putOne(db, Stores.recipes, r);
    await loadAll();

    // return to recipe view after saving
    state.viewingId = r.id;
    state.screen = 'recipe';
    state.editingId = null;
    render();
  };

  document.getElementById('e_delete').onclick = async () => {
    const ok = confirm('Delete this recipe?');
    if (!ok) return;
    await deleteOne(db, Stores.recipes, r.id);
    await loadAll();
    state.screen = 'recipes';
    state.editingId = null;
    state.viewingId = null;
    render();
  };
}

function categoryOptionsHTML(selectedId) {
  return state.categories
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(c => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${escapeHTML(c.name)}</option>`)
    .join('');
}

function manualFormHTML({ mode, title = '', categoryId, ingredientsText = '', instructionsText = '', photoPreviewUrls = [] }) {
  const defaultCat = categoryId || (state.categories[0]?.id || '');
  return `
    <div class="section-title">Manual Entry</div>
    <div class="card">
      <div class="label">Title</div>
      <input class="input" id="m_title" placeholder="Recipe name" value="${escapeAttr(title)}" />

      <div class="label">Category</div>
      <select class="select" id="m_category">${categoryOptionsHTML(defaultCat)}</select>

      <div class="label">Photos (optional)</div>
      <input class="input" id="m_photo" type="file" accept="image/*" multiple />
      ${photoPreviewUrls.length ? `
        <div class="row" style="flex-wrap:wrap; margin-top:10px">
          ${photoPreviewUrls.map(u => `<img class="thumb" src="${u}" alt="preview" />`).join('')}
        </div>
      ` : ''}

      <div class="label">Ingredients (one per line)</div>
      <textarea class="textarea" id="m_ingredients" placeholder="e.g.\n1 cup flour\n2 eggs">${escapeHTML(ingredientsText)}</textarea>

      <div class="label">Instructions (one step per line)</div>
      <textarea class="textarea" id="m_instructions" placeholder="e.g.\nPreheat oven\nMix ingredients\nBake">${escapeHTML(instructionsText)}</textarea>

      <div class="hr"></div>
      <div class="row">
        <button class="btn btn-primary" id="m_save">Save</button>
        <button class="btn" id="m_clear">Clear</button>
      </div>
    </div>
  `;
}


function bindManualForm({ mode }) {
  const titleEl = document.getElementById('m_title');
  const catEl = document.getElementById('m_category');
  const ingEl = document.getElementById('m_ingredients');
  const insEl = document.getElementById('m_instructions');
  const fileEl = document.getElementById('m_photo');

  fileEl.onchange = async () => {
    const files = Array.from(fileEl.files || []);
    if (!files.length) return;

    // convert all selected files to compressed jpeg blobs
    addManualPhotoBlobs = [];
    for (const f of files) {
      addManualPhotoBlobs.push(await fileToJpegBlob(f));
    }

    const previewUrls = addManualPhotoBlobs.map(b => URL.createObjectURL(b));

    const host = document.getElementById('addFlow');
    host.innerHTML = manualFormHTML({
      mode,
      title: titleEl.value,
      categoryId: catEl.value,
      ingredientsText: ingEl.value,
      instructionsText: insEl.value,
      photoPreviewUrls: previewUrls
    });
    bindManualForm({ mode });
  };

  document.getElementById('m_clear').onclick = () => {
    addManualPhotoBlobs = [];
    document.getElementById('addFlow').innerHTML = '';
  };

  document.getElementById('m_save').onclick = async () => {
    const title = titleEl.value.trim();
    const categoryId = catEl.value;

    const ingredients = ingEl.value
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
      .map(text => ({ id: uuid(), text, checked: false }));

    const instructions = insEl.value
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);

    const hasAnything = title || ingredients.length || instructions.length || addManualPhotoBlobs.length;
    if (!hasAnything) {
      addManualPhotoBlobs = [];
      document.getElementById('addFlow').innerHTML = '';
      return;
    }

    const recipe = {
      id: uuid(),
      title,
      categoryId,
      isFavorite: false,
      isPhotoOnly: false,
      ingredients,
      instructions,
      photos: addManualPhotoBlobs.slice(), // store all photos
      createdAt: Date.now(),
    };

    await putOne(db, Stores.recipes, recipe);
    await loadAll();

    addManualPhotoBlobs = [];
    document.getElementById('addFlow').innerHTML = '';

    state.viewingId = recipe.id;
    state.screen = 'recipe';
    render();
  };
}


  document.getElementById('m_clear').onclick = () => {
    document.getElementById('addFlow').innerHTML = '';
  };

  document.getElementById('m_save').onclick = async () => {
    const title = titleEl.value.trim();
    const categoryId = catEl.value;

    const ingredients = ingEl.value
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
      .map(text => ({ id: uuid(), text, checked: false }));

    const instructions = insEl.value
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);

    const hasAnything = title || ingredients.length || instructions.length || photoBlob;
    if (!hasAnything) {
      document.getElementById('addFlow').innerHTML = '';
      return;
    }

    const recipe = {
      id: uuid(),
      title,
      categoryId,
      isFavorite: false,
      isPhotoOnly: false,
      ingredients,
      instructions,
      photos: photoBlob ? [photoBlob] : [],
      createdAt: Date.now(),
    };

    await putOne(db, Stores.recipes, recipe);
    await loadAll();
    document.getElementById('addFlow').innerHTML = '';

    state.viewingId = recipe.id;
    state.screen = 'recipe';
    render();
  };

function photoOnlyFormHTML({ title = '', categoryId, photoPreviewUrls = [] }) {
  const defaultCat = categoryId || (state.categories[0]?.id || '');
  return `
    <div class="section-title">Photo Only</div>
    <div class="card">
      <div class="label">Title (optional)</div>
      <input class="input" id="p_title" placeholder="Recipe name" value="${escapeAttr(title)}" />

      <div class="label">Category</div>
      <select class="select" id="p_category">${categoryOptionsHTML(defaultCat)}</select>

      <div class="label">Photos</div>
      <input class="input" id="p_photo" type="file" accept="image/*" multiple />
      ${photoPreviewUrls.length ? `
        <div class="row" style="flex-wrap:wrap; margin-top:10px">
          ${photoPreviewUrls.map(u => `<img class="thumb" src="${u}" alt="preview" />`).join('')}
        </div>
      ` : ''}

      <div class="hr"></div>
      <div class="row">
        <button class="btn btn-primary" id="p_save">Save</button>
        <button class="btn" id="p_clear">Clear</button>
      </div>
    </div>
  `;
}


function bindPhotoOnlyForm() {
  const titleEl = document.getElementById('p_title');
  const catEl = document.getElementById('p_category');
  const fileEl = document.getElementById('p_photo');

  fileEl.onchange = async () => {
    const files = Array.from(fileEl.files || []);
    if (!files.length) return;

    addPhotoOnlyBlobs = [];
    for (const f of files) {
      addPhotoOnlyBlobs.push(await fileToJpegBlob(f));
    }

    const previewUrls = addPhotoOnlyBlobs.map(b => URL.createObjectURL(b));
    const host = document.getElementById('addFlow');
    host.innerHTML = photoOnlyFormHTML({
      title: titleEl.value,
      categoryId: catEl.value,
      photoPreviewUrls: previewUrls
    });
    bindPhotoOnlyForm();
  };

  document.getElementById('p_clear').onclick = () => {
    addPhotoOnlyBlobs = [];
    document.getElementById('addFlow').innerHTML = '';
  };

  document.getElementById('p_save').onclick = async () => {
    const title = titleEl.value.trim();
    const categoryId = catEl.value;

    if (!title && !addPhotoOnlyBlobs.length) {
      addPhotoOnlyBlobs = [];
      document.getElementById('addFlow').innerHTML = '';
      return;
    }
    if (!addPhotoOnlyBlobs.length) {
      alert('Please choose at least one photo (or use Manual Add).');
      return;
    }

    const recipe = {
      id: uuid(),
      title,
      categoryId,
      isFavorite: false,
      isPhotoOnly: true,
      ingredients: [],
      instructions: [],
      photos: addPhotoOnlyBlobs.slice(), // store all photos
      createdAt: Date.now(),
    };

    await putOne(db, Stores.recipes, recipe);
    await loadAll();

    addPhotoOnlyBlobs = [];
    document.getElementById('addFlow').innerHTML = '';

    state.viewingId = recipe.id;
    state.screen = 'recipe';
    render();
  };
}

// ====== Settings ======
function settingsScreenHTML() {
  return `
    <div class="card">
      <div class="section-title" style="margin-top:0">Appearance</div>

      <div class="label">Cookbook name</div>
      <input class="input" id="cookbookName" placeholder="My Cookbook" value="${escapeAttr(state.cookbookName || 'My Cookbook')}" />

      <div class="label" style="margin-top:12px">Theme</div>
      <select class="select" id="themeSelect">
        ${themeOption('charcoal','Charcoal (default)')}
        ${themeOption('sage','Sage')}
        ${themeOption('blue','Blue')}
        ${themeOption('pearl','Pearl (light)')}
        ${themeOption('butter','Butter (light)')}
        ${themeOption('sky','Sky (light)')}
      </select>

      <div class="hr"></div>

      <div class="section-title" style="margin-top:0">Shopping</div>
      <div class="row-between">
        <div>
          <div class="item-title">Grocery Mode</div>
          <div class="small">Show ingredient checkboxes in recipe view</div>
        </div>
        <input type="checkbox" id="groceryMode" ${state.groceryMode ? 'checked' : ''} />
      </div>

      <div class="hr"></div>
      <div class="section-title">Categories</div>
      <div class="label">Add Category</div>
      <div class="row">
        <input class="input" id="newCat" placeholder="e.g. Snacks" />
        <button class="btn btn-primary" id="addCat">Add</button>
      </div>

      <div class="label" style="margin-top:12px">Reorder / Rename / Delete</div>
      <div class="list" id="catList"></div>

      
    </div>
  `;
}

function themeOption(value, label) {
  return `<option value="${value}" ${state.theme === value ? 'selected' : ''}>${label}</option>`;
}

function bindSettingsScreen() {
  const nameEl = document.getElementById('cookbookName');
  nameEl.addEventListener('input', async () => {
    state.cookbookName = nameEl.value.trim() || 'My Cookbook';
    await setSetting(db, 'cookbookName', state.cookbookName);
    setTopTitleFromState();
  });

  const themeEl = document.getElementById('themeSelect');
  themeEl.addEventListener('change', async () => {
    state.theme = themeEl.value;
    await setSetting(db, 'theme', state.theme);
    applyTheme(state.theme);
  });

  const gm = document.getElementById('groceryMode');
  gm.addEventListener('change', async () => {
    state.groceryMode = gm.checked;
    await setSetting(db, 'groceryMode', state.groceryMode);
  });

  document.getElementById('addCat').onclick = async () => {
    const input = document.getElementById('newCat');
    const name = input.value.trim();
    if (!name) return;
    const maxOrder = state.categories.reduce((m, c) => Math.max(m, c.order), -1);
    const cat = { id: uuid(), name, order: maxOrder + 1 };
    await putOne(db, Stores.categories, cat);
    input.value = '';
    await loadAll();
    render();
  };

  renderCategoryManager();
}

function renderCategoryManager() {
  const host = document.getElementById('catList');
  if (!host) return;

  host.innerHTML = state.categories
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(c => `
      <div class="item" data-cat-id="${c.id}">
        <div style="min-width:0">
          <div class="item-title">${escapeHTML(c.name)}</div>
          <div class="small">Recipes: ${state.recipes.filter(r => r.categoryId === c.id).length}</div>
        </div>
        <div class="row">
          <button class="btn" data-move-up>↑</button>
          <button class="btn" data-move-down>↓</button>
          <button class="btn" data-rename>Rename</button>
          <button class="btn btn-danger" data-delete>Delete</button>
        </div>
      </div>
    `)
    .join('');

  host.querySelectorAll('[data-cat-id]').forEach(row => {
    const id = row.dataset.catId;
    row.querySelector('[data-move-up]').onclick = async () => moveCategory(id, -1);
    row.querySelector('[data-move-down]').onclick = async () => moveCategory(id, +1);
    row.querySelector('[data-rename]').onclick = async () => renameCategory(id);
    row.querySelector('[data-delete]').onclick = async () => deleteCategoryWithReassign(id);
  });
}

async function moveCategory(catId, dir) {
  const sorted = state.categories.slice().sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex(c => c.id === catId);
  const swapIdx = idx + dir;
  if (swapIdx < 0 || swapIdx >= sorted.length) return;

  const a = sorted[idx];
  const b = sorted[swapIdx];
  const temp = a.order;
  a.order = b.order;
  b.order = temp;

  await putOne(db, Stores.categories, a);
  await putOne(db, Stores.categories, b);
  await loadAll();
  render();
}

async function deleteCategoryWithReassign(catId) {
  const cat = state.categories.find(c => c.id === catId);
  if (!cat) return;

  const affected = state.recipes.filter(r => r.categoryId === catId);
  if (!affected.length) {
    await deleteOne(db, Stores.categories, catId);
    await loadAll();
    render();
    return;
  }

  const otherCats = state.categories.filter(c => c.id !== catId);
  if (!otherCats.length) {
    alert('Create another category before deleting the last one.');
    return;
  }

  const targetName = otherCats[0].name;
  const message =
    '"' + cat.name + '" has ' +
    affected.length +
    ' recipe(s). Move them to "' +
    targetName +
    '" and delete?';

  const ok = confirm(message);
  if (!ok) return;

  const targetId = otherCats[0].id;
  for (const r of affected) {
    r.categoryId = targetId;
    await putOne(db, Stores.recipes, r);
  }

  await deleteOne(db, Stores.categories, catId);
  await loadAll();
  render();
}


// ====== Utils ======
function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) {
  return escapeHTML(s).replace(/\n/g, ' ');
}

async function fileToJpegBlob(file) {
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = URL.createObjectURL(file);
  });

  const maxW = 1600;
  const scale = Math.min(1, maxW / img.width);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  return await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
}
