(() => {
  const config = window.DIAN_CONFIG || {};
  const ready = Boolean(config.supabaseUrl && config.supabasePublishableKey && window.supabase);
  const setupBanner = document.getElementById('setup-banner');
  const authDialog = document.getElementById('auth-dialog');
  const authMessage = document.getElementById('auth-message');
  const signupForm = document.getElementById('signup-form');
  const loginForm = document.getElementById('login-form');
  const accountArea = document.getElementById('espace-vendeur');
  const productGrid = document.getElementById('product-grid');
  let client = null;
  let currentUser = null;
  let currentStore = null;
  let allProducts = [];

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const showMessage = (message, isError = false) => {
    authMessage.textContent = message;
    authMessage.classList.toggle('error', isError);
  };
  const setBusy = (form, busy) => {
    const button = form.querySelector('button[type="submit"]');
    if (button) { button.disabled = busy; button.style.opacity = busy ? '.6' : '1'; }
  };
  const setStatus = (message, kind = 'pending') => {
    const box = document.getElementById('account-status');
    box.textContent = message;
    box.dataset.kind = kind;
  };
  const openAuth = () => { if (!ready) { setupBanner.hidden = false; setupBanner.scrollIntoView({ behavior: 'smooth' }); return; } authDialog.showModal(); };

  ['open-auth', 'open-auth-hero', 'open-auth-empty', 'open-auth-how'].forEach((id) => document.getElementById(id).addEventListener('click', openAuth));
  document.getElementById('close-auth').addEventListener('click', () => authDialog.close());
  authDialog.addEventListener('click', (event) => { if (event.target === authDialog) authDialog.close(); });
  document.getElementById('tab-signup').addEventListener('click', () => {
    signupForm.hidden = false; loginForm.hidden = true;
    document.getElementById('tab-signup').classList.add('active'); document.getElementById('tab-login').classList.remove('active'); showMessage('');
  });
  document.getElementById('tab-login').addEventListener('click', () => {
    signupForm.hidden = true; loginForm.hidden = false;
    document.getElementById('tab-login').classList.add('active'); document.getElementById('tab-signup').classList.remove('active'); showMessage('');
  });

  const storage = () => client.storage.from('store-media');
  const publicImage = (path) => path ? storage().getPublicUrl(path).data.publicUrl : '';
  const cleanPhone = (phone) => String(phone || '').replace(/[^0-9]/g, '');
  const formatPrice = (amount) => `${Number(amount || 0).toLocaleString('fr-FR')} GNF`;

  function renderProducts() {
    const search = document.getElementById('search').value.trim().toLocaleLowerCase('fr');
    const category = document.getElementById('category-filter').value;
    const shown = allProducts.filter((product) => {
      const store = product.stores || {};
      const matchesSearch = !search || `${product.title} ${product.description || ''} ${store.store_name || ''}`.toLocaleLowerCase('fr').includes(search);
      return matchesSearch && (!category || product.category === category);
    });
    if (!shown.length) {
      productGrid.innerHTML = '<div class="empty-state"><div class="empty-icon">▦</div><b>Aucun produit à afficher pour le moment</b><p>Reviens bientôt ou crée un compte vendeur pour proposer tes articles.</p><button class="text-button" data-open-auth>Ouvrir un compte vendeur <span>↗</span></button></div>';
      productGrid.querySelector('[data-open-auth]').addEventListener('click', openAuth);
      return;
    }
    productGrid.innerHTML = shown.map((product) => {
      const store = product.stores || {};
      const image = publicImage(product.image_path);
      const phone = cleanPhone(store.whatsapp);
      const message = encodeURIComponent(`Bonjour ${store.store_name || 'vendeur'}, je suis intéressé(e) par ${product.title}. Est-il disponible ?`);
      const waLink = phone ? `https://wa.me/${phone}?text=${message}` : `https://wa.me/224629398152?text=${message}`;
      const avatar = store.avatar_path ? `<img src="${escapeHtml(publicImage(store.avatar_path))}" alt="" style="width:22px;height:22px;object-fit:cover;border-radius:50%;vertical-align:middle;margin-right:6px">` : '<span style="display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#edf2ed;color:#456b50;margin-right:6px">D</span>';
      return `<article class="product-card"><img class="product-image" src="${escapeHtml(image)}" alt="${escapeHtml(product.title)}"><div class="product-info"><span class="product-category">${escapeHtml(product.category)}</span><h3>${escapeHtml(product.title)}</h3><p>${escapeHtml(product.description || '')}</p><b class="product-price">${formatPrice(product.price_gnf)}</b><div class="product-store">${avatar}<span>Boutique : ${escapeHtml(store.store_name || 'Vendeur DIAN')}</span></div><a class="product-contact" href="${waLink}" target="_blank" rel="noopener noreferrer">Contacter le vendeur sur WhatsApp</a></div></article>`;
    }).join('');
  }

  async function loadCatalog() {
    if (!client) return;
    const { data, error } = await client.from('products').select('id,title,category,description,price_gnf,quantity,image_path,stores!inner(store_name,whatsapp,avatar_path,approval_status)').eq('is_published', true).eq('stores.approval_status', 'approved').order('created_at', { ascending: false });
    if (error) { console.error('Chargement du catalogue :', error.message); return; }
    allProducts = data || [];
    renderProducts();
  }

  async function loadDashboard() {
    if (!client || !currentUser) { accountArea.hidden = true; return; }
    accountArea.hidden = false;
    accountArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const { data: store, error } = await client.from('stores').select('*').eq('owner_id', currentUser.id).maybeSingle();
    if (error || !store) { setStatus('Ta boutique se prépare. Si tu viens de créer ton compte, confirme ton adresse e-mail puis reconnecte-toi.', 'pending'); return; }
    currentStore = store;
    document.getElementById('store-name').value = store.store_name || '';
    document.getElementById('store-whatsapp').value = store.whatsapp || '';
    document.getElementById('store-description').value = store.description || '';
    if (store.approval_status === 'approved') setStatus('Ta boutique est approuvée. Tu peux gérer tes annonces.', 'approved');
    else setStatus('Ta boutique attend la vérification de DIAN MARKET GN avant de pouvoir apparaître publiquement.', 'pending');
    const { data: products } = await client.from('products').select('id,title,price_gnf,is_published').eq('store_id', store.id).order('created_at', { ascending: false });
    const sellerProducts = document.getElementById('seller-products');
    sellerProducts.innerHTML = (products || []).length ? products.map((product) => `<div class="seller-product"><b>${escapeHtml(product.title)}</b><span>${formatPrice(product.price_gnf)}</span><br>${product.is_published ? 'Publié' : 'En attente de vérification'}</div>`).join('') : '<p class="small-muted">Tu n’as pas encore d’annonce.</p>';
  }

  if (!ready) {
    setupBanner.hidden = false;
    document.getElementById('search').disabled = true;
    document.getElementById('category-filter').disabled = true;
  } else {
    client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
    document.getElementById('search').addEventListener('input', renderProducts);
    document.getElementById('category-filter').addEventListener('change', renderProducts);
    client.auth.onAuthStateChange((event, session) => {
      currentUser = session?.user || null;
      window.setTimeout(() => { loadDashboard(); }, 0);
      if (event === 'SIGNED_OUT') { currentStore = null; accountArea.hidden = true; }
    });
    client.auth.getSession().then(({ data }) => { currentUser = data.session?.user || null; loadCatalog(); loadDashboard(); });

    signupForm.addEventListener('submit', async (event) => {
      event.preventDefault(); setBusy(signupForm, true); showMessage('Création du compte…');
      const { data, error } = await client.auth.signUp({
        email: document.getElementById('signup-email').value.trim(),
        password: document.getElementById('signup-password').value,
        options: { data: { store_name: document.getElementById('signup-store').value.trim(), whatsapp: document.getElementById('signup-phone').value.trim() } }
      });
      setBusy(signupForm, false);
      if (error) { showMessage(error.message, true); return; }
      if (data.session) { showMessage('Compte créé. Confirme ton e-mail si un message de vérification arrive, puis complète ta boutique.'); await loadDashboard(); }
      else showMessage('Compte créé. Ouvre l’e-mail de vérification envoyé par Supabase, confirme-le, puis reviens ici pour te connecter.');
    });

    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault(); setBusy(loginForm, true); showMessage('Connexion…');
      const { error } = await client.auth.signInWithPassword({ email: document.getElementById('login-email').value.trim(), password: document.getElementById('login-password').value });
      setBusy(loginForm, false);
      if (error) showMessage('Connexion impossible. Vérifie ton e-mail, ton mot de passe et la confirmation de l’e-mail.', true);
      else { showMessage('Connexion réussie.'); authDialog.close(); await loadDashboard(); }
    });

    document.getElementById('sign-out').addEventListener('click', async () => { await client.auth.signOut(); accountArea.hidden = true; });

    document.getElementById('store-form').addEventListener('submit', async (event) => {
      event.preventDefault(); if (!currentUser || !currentStore) return;
      const form = event.currentTarget; setBusy(form, true); setStatus('Enregistrement…');
      const updates = { store_name: document.getElementById('store-name').value.trim(), whatsapp: document.getElementById('store-whatsapp').value.trim(), description: document.getElementById('store-description').value.trim() };
      const file = document.getElementById('avatar-file').files[0];
      if (file) {
        if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) { setBusy(form, false); setStatus('Choisis une image de moins de 5 Mo.', 'error'); return; }
        const path = `${currentUser.id}/avatar-${Date.now()}.${file.name.split('.').pop().toLowerCase()}`;
        const { error: uploadError } = await storage().upload(path, file, { upsert: false, contentType: file.type });
        if (uploadError) { setBusy(form, false); setStatus(`Photo non envoyée : ${uploadError.message}`, 'error'); return; }
        updates.avatar_path = path;
      }
      const { error } = await client.from('stores').update(updates).eq('id', currentStore.id);
      setBusy(form, false);
      if (error) setStatus(`Enregistrement impossible : ${error.message}`, 'error');
      else { setStatus('Boutique enregistrée. Elle reste soumise à vérification.', 'pending'); await loadDashboard(); }
    });

    document.getElementById('product-form').addEventListener('submit', async (event) => {
      event.preventDefault(); if (!currentUser || !currentStore) return;
      if (currentStore.approval_status !== 'approved') { setStatus('Ta boutique doit être approuvée avant l’ajout de produits.', 'pending'); return; }
      const form = event.currentTarget; setBusy(form, true);
      const file = document.getElementById('product-image').files[0];
      if (!file || !file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) { setBusy(form, false); setStatus('Choisis une photo de moins de 5 Mo.', 'error'); return; }
      const path = `${currentUser.id}/product-${Date.now()}.${file.name.split('.').pop().toLowerCase()}`;
      const { error: uploadError } = await storage().upload(path, file, { upsert: false, contentType: file.type });
      if (uploadError) { setBusy(form, false); setStatus(`Photo non envoyée : ${uploadError.message}`, 'error'); return; }
      const { error } = await client.from('products').insert({ store_id: currentStore.id, title: document.getElementById('product-title').value.trim(), category: document.getElementById('product-category').value, description: document.getElementById('product-description').value.trim(), price_gnf: Number(document.getElementById('product-price').value), quantity: Number(document.getElementById('product-stock').value), image_path: path });
      setBusy(form, false);
      if (error) setStatus(`Annonce non envoyée : ${error.message}`, 'error');
      else { form.reset(); setStatus('Annonce envoyée à DIAN MARKET GN pour vérification.', 'pending'); await loadDashboard(); }
    });
  }
})();
