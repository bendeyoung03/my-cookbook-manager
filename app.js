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
  const hasAny = (state.recipes || []).length > 0;

  const empty = !hasAny ? `
    <div class="card empty-card">
      <div class="empty-emoji">📚</div>
      <div class="empty-title">Your cookbook is empty</div>
      <div class="empty-sub">Tap + in the top-right to add your first recipe.</div>
    </div>
  ` : '';

  return `
    <div class="card">
      <div class="label">Search</div>
      <input class="input" id="search" placeholder="Search by name or ingredient" value="${escapeAttr(state.search)}" />
      <div class="small" style="margin-top:8px">Tip: Add this app to your Home Screen for the best experience.</div>
    </div>

    ${empty}

    ${renderFavoritesSection()}
    ${state.categories.map(c => renderCategorySection(c)).join('')}
  `;
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
  return `
    <div class="item" data-open-recipe="${r.id}">
      <div style="min-width:0">
        <div class="item-title">${escapeHTML(r.title || 'Untitled')}</div>
        <div class="badge">${r.isPhotoOnly ? 'Photo-only' : `${(r.ingredients || []).length} ingredients`}${r.isFavorite ? ' • ★' : ''}</div>
      </div>
      ${hasPhoto ? '<div class="badge">📷</div>' : '<div class="badge">›</div>'}
    </div>
  `;
}

function bindRecipesScreen() {
  const search = document.getElementById('search');
  search.addEventListener('input', () => {
    state.search = search.value;
    render();
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
  const banner = (r.photos && r.photos.length)
    ? `<div class="recipe-banner">
         <img src="${URL.createObjectURL(r.photos[0])}" alt="Recipe photo" data-open-photo="0" />
       </div>`
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

  // tap banner image to enlarge
  document.querySelectorAll('[data-open-photo]').forEach(el => {
    el.addEventListener('click', () => {
      const idx = Number(el.dataset.openPhoto);
      const blob = r.photos[idx];
      if (!blob) return;
      openPhotoViewer(blob);
    });
  });
}

function openPhotoViewer(blob) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const modal = document.createElement('div');
  modal.className = 'modal';

  const url = URL.createObjectURL(blob);
  modal.innerHTML = `
    <div class="row-between" style="margin-bottom:10px">
      <div class="item-title">Photo</div>
      <button class="btn" id="close">Done</button>
    </div>
    <img class="full" src="${url}" alt="Photo" />
  `;

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  modal.querySelector('#close').addEventListener('click', () => backdrop.remove());
}

// ====== Add Screen (OCR removed) ======
function addScreenHTML() {
  return `
    <div class="card">
      <div class="section-title" style="margin-top:0">Choose how to add</div>
      <div class="list">
        <button class="btn btn-primary" id="addManual">Add Manually</button>
        <button class="btn" id="addPhotoOnly">Add Photo Only</button>
      </div>
    </div>

    <div id="addFlow"></div>
  `;
}

function bindAddScreen() {
  const host = document.getElementById('addFlow');

  document.getElementById('addManual').onclick = () => {
    host.innerHTML = manualFormHTML({ mode: 'manual' });
    bindManualForm({ mode: 'manual' });
  };

  document.getElementById('addPhotoOnly').onclick = () => {
    host.innerHTML = photoOnlyFormHTML({});
    bindPhotoOnlyForm();
  };
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
              <button class="btn btn-icon" data-remove-photo="${idx}" style="position:absolute; top:-8px; right:-8px;">✕</button>
            </div>
          `;
        }).join('')}
      </div>
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

      <div class="label">Add photo (optional)</div>
      <input class="input" id="e_photo" type="file" accept="image/*" />

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

  let newPhotoBlob = null;
  const fileEl = document.getElementById('e_photo');
  fileEl.onchange = async () => {
    const f = fileEl.files?.[0];
    if (!f) return;
    newPhotoBlob = await fileToJpegBlob(f);
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

    if (newPhotoBlob) {
      r.photos = r.photos || [];
      r.photos.push(newPhotoBlob);
      newPhotoBlob = null;
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

function manualFormHTML({ mode, title = '', categoryId, ingredientsText = '', instructionsText = '', photoPreviewUrl = '' }) {
  const defaultCat = categoryId || (state.categories[0]?.id || '');
  return `
    <div class="section-title">Manual Entry</div>
    <div class="card">
      <div class="label">Title</div>
      <input class="input" id="m_title" placeholder="Recipe name" value="${escapeAttr(title)}" />

      <div class="label">Category</div>
      <select class="select" id="m_category">${categoryOptionsHTML(defaultCat)}</select>

      <div class="label">Photo (optional)</div>
      <input class="input" id="m_photo" type="file" accept="image/*" />
      ${photoPreviewUrl ? `<div style="margin-top:10px"><img class="thumb" src="${photoPreviewUrl}" alt="preview" /></div>` : ''}

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

  let photoBlob = null;
  fileEl.onchange = async () => {
    const f = fileEl.files?.[0];
    if (!f) return;
    photoBlob = await fileToJpegBlob(f);
    const url = URL.createObjectURL(photoBlob);

    const host = document.getElementById('addFlow');
    host.innerHTML = manualFormHTML({
      mode,
      title: titleEl.value,
      categoryId: catEl.value,
      ingredientsText: ingEl.value,
      instructionsText: insEl.value,
      photoPreviewUrl: url
    });
    bindManualForm({ mode });
  };

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
}

function photoOnlyFormHTML({ title = '', categoryId, photoPreviewUrl = '' }) {
  const defaultCat = categoryId || (state.categories[0]?.id || '');
  return `
    <div class="section-title">Photo Only</div>
    <div class="card">
      <div class="label">Title (optional)</div>
      <input class="input" id="p_title" placeholder="Recipe name" value="${escapeAttr(title)}" />

      <div class="label">Category</div>
      <select class="select" id="p_category">${categoryOptionsHTML(defaultCat)}</select>

      <div class="label">Photo</div>
      <input class="input" id="p_photo" type="file" accept="image/*" />
      ${photoPreviewUrl ? `<div style="margin-top:10px"><img class="thumb" src="${photoPreviewUrl}" alt="preview" /></div>` : ''}

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

  let photoBlob = null;

  fileEl.onchange = async () => {
    const f = fileEl.files?.[0];
    if (!f) return;
    photoBlob = await fileToJpegBlob(f);
    const url = URL.createObjectURL(photoBlob);
    const host = document.getElementById('addFlow');
    host.innerHTML = photoOnlyFormHTML({
      title: titleEl.value,
      categoryId: catEl.value,
      photoPreviewUrl: url
    });
    bindPhotoOnlyForm();
  };

  document.getElementById('p_clear').onclick = () => {
    document.getElementById('addFlow').innerHTML = '';
  };

  document.getElementById('p_save').onclick = async () => {
    const title = titleEl.value.trim();
    const categoryId = catEl.value;

    if (!title && !photoBlob) {
      document.getElementById('addFlow').innerHTML = '';
      return;
    }
    if (!photoBlob) {
      alert('Please choose a photo (or use Manual Add).');
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
      photos: [photoBlob],
      createdAt: Date.now(),
    };

    await putOne(db, Stores.recipes, recipe);
    await loadAll();
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

      <div class="hr"></div>
      <div class="small">Data is stored only on this device (offline-first). iCloud sync can be added later.</div>
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

async function renameCategory(catId) {
  const cat = state.categories.find(c => c.id === catId);
  if (!cat) return;
  const name = prompt('New category name:', cat.name);
  if (!name) return;
  cat.name = name.trim();
  if (!cat.name) return;
  await putOne(db, Stores.categories, cat);
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

  const otherCats = state.categories.filter(c => c.id !== catId).sort((a, b) => a.order - b.order);
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
