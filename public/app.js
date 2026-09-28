(() => {
  'use strict';

  const $ = id => document.getElementById(id);

  const state = {
    user: null,
    subscriptionExpiresAt: null,
    movies: [],
    selectedMovie: null,
    currentPurchase: null,
    authMode: 'login',
    editingMovie: null
  };

  function escapeHtml(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function money(n) {
    return `${Number(n || 0).toLocaleString('mn-MN')}₮`;
  }

  async function api(url, options = {}) {
    const opts = {
      method: options.method || 'GET',
      credentials: 'include',
      headers: {
        ...(options.headers || {})
      }
    };

    if (options.body !== undefined) {
      opts.headers['content-type'] = 'application/json';
      opts.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, opts);
    const raw = await response.text();

    let data = {};

    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        data = { error: raw };
      }
    }

    if (!response.ok) {
      const error = new Error(
        data?.error || `HTTP ${response.status}`
      );

      error.status = response.status;
      throw error;
    }

    return data;
  }

  function openModal(id) {
    const modal = $(id);

    if (!modal) return;

    modal.classList.add('open', 'active');
    modal.style.display = 'flex';

    document.body.style.overflow = 'hidden';
  }

  function closeModal(modalOrId) {
    const modal =
      typeof modalOrId === 'string'
        ? $(modalOrId)
        : modalOrId;

    if (!modal) return;

    modal.classList.remove('open', 'active');
    modal.style.display = 'none';

    if (modal.id === 'playerModal') {
      const video = $('video');

      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
    }

    const anyOpen =
      [...document.querySelectorAll('.modal')]
        .some(
          m => m.style.display === 'flex'
        );

    if (!anyOpen) {
      document.body.style.overflow = '';
    }
  }

  function setButtonBusy(
    button,
    busy,
    busyText = 'Түр хүлээнэ үү...'
  ) {
    if (!button) return;

    if (busy) {
      button.dataset.oldText =
        button.textContent;

      button.disabled = true;
      button.textContent = busyText;
    } else {
      button.disabled = false;

      if (button.dataset.oldText) {
        button.textContent =
          button.dataset.oldText;

        delete button.dataset.oldText;
      }
    }
  }

  function showMessage(
    el,
    text,
    isError = false
  ) {
    if (!el) return;

    el.textContent = text || '';

    el.style.color =
      isError
        ? '#ff6b6b'
        : '';
  }

  function requireLogin() {
    if (state.user) {
      return true;
    }

    setAuthMode('login');
    openModal('authModal');

    return false;
  }

  function setAuthMode(mode) {
    state.authMode =
      mode === 'register'
        ? 'register'
        : 'login';

    document
      .querySelectorAll('[data-tab]')
      .forEach(btn => {
        btn.classList.toggle(
          'active',
          btn.dataset.tab === state.authMode
        );
      });

    const isRegister =
      state.authMode === 'register';

    $('nameLabel')
      ?.classList
      .toggle(
        'hidden',
        !isRegister
      );

    if ($('nameInput')) {
      $('nameInput').required =
        isRegister;
    }

    if ($('authTitle')) {
      $('authTitle').textContent =
        isRegister
          ? 'Бүртгүүлэх'
          : 'Нэвтрэх';
    }

    if ($('authSubmit')) {
      $('authSubmit').textContent =
        isRegister
          ? 'Бүртгүүлэх'
          : 'Нэвтрэх';
    }

    showMessage(
      $('authError'),
      ''
    );
  }

  function updateAccountUI() {
    const adminBtn =
      $('adminBtn');

    const authBtn =
      $('authBtn');

    const accountLine =
      $('accountLine');

    const isAdmin =
      state.user?.role === 'admin';

    adminBtn
      ?.classList
      .toggle(
        'hidden',
        !isAdmin
      );

    if (!state.user) {
      if (authBtn) {
        authBtn.textContent =
          'Нэвтрэх';
      }

      if (accountLine) {
        accountLine.textContent =
          'Нэвтрээгүй';
      }

      return;
    }

    if (authBtn) {
      authBtn.textContent =
        state.user.name ||
        state.user.email;
    }

    if (accountLine) {
      let text =
        state.user.name ||
        state.user.email;

      if (
        state.subscriptionExpiresAt &&
        Number(
          state.subscriptionExpiresAt
        ) > Date.now()
      ) {
        const d =
          new Date(
            Number(
              state.subscriptionExpiresAt
            )
          );

        text +=
          ` • Premium ${d.toLocaleDateString('mn-MN')} хүртэл`;
      }

      accountLine.textContent =
        text;
    }
  }

  async function refreshSession() {
    const data =
      await api('/api/me');

    state.user =
      data.user || null;

    state.subscriptionExpiresAt =
      data.subscription_expires_at ||
      null;

    updateAccountUI();
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();

    const button =
      $('authSubmit');

    setButtonBusy(
      button,
      true
    );

    showMessage(
      $('authError'),
      ''
    );

    try {
      const payload = {
        email:
          $('emailInput')
            ?.value
            .trim(),

        password:
          $('passInput')
            ?.value ||
          ''
      };

      if (
        state.authMode ===
        'register'
      ) {
        payload.name =
          $('nameInput')
            ?.value
            .trim();
      }

      await api(
        state.authMode === 'register'
          ? '/api/register'
          : '/api/login',
        {
          method: 'POST',
          body: payload
        }
      );

      await refreshSession();
      await loadMovies();

      closeModal(
        'authModal'
      );

      $('authForm')
        ?.reset();

      setAuthMode(
        'login'
      );

    } catch (error) {
      showMessage(
        $('authError'),
        error.message ||
          'Алдаа гарлаа.',
        true
      );
    } finally {
      setButtonBusy(
        button,
        false
      );
    }
  }

  async function logout() {
    try {
      await api(
        '/api/logout',
        {
          method: 'POST'
        }
      );
    } catch {}

    state.user = null;

    state.subscriptionExpiresAt =
      null;

    state.selectedMovie =
      null;

    state.currentPurchase =
      null;

    updateAccountUI();

    await loadMovies();
  }

  async function loadMovies() {
    const data =
      await api(
        '/api/movies'
      );

    state.movies =
      Array.isArray(
        data.movies
      )
        ? data.movies
        : [];

    renderMovies();
    renderAdminMovies();
  }

  function renderMovies() {
    const grid =
      $('movieGrid');

    const empty =
      $('emptyState');

    if (!grid) return;

    const query =
      ($('search')?.value || '')
        .trim()
        .toLowerCase();

    const movies =
      state.movies.filter(
        movie => {
          if (!query) {
            return true;
          }

          return [
            movie.title,
            movie.genre,
            movie.description
          ]
            .filter(Boolean)
            .some(
              v =>
                String(v)
                  .toLowerCase()
                  .includes(query)
            );
        }
      );

    empty
      ?.classList
      .toggle(
        'hidden',
        movies.length > 0
      );

    grid.innerHTML =
      movies
        .map(
          movie => {
            const poster =
              movie.poster_url
                ? `
                  <img
                    src="${escapeHtml(movie.poster_url)}"
                    alt="${escapeHtml(movie.title)}"
                    loading="lazy"
                  >
                `
                : `
                  <div class="moviePosterFallback">
                    MOOD
                  </div>
                `;

            const status =
              movie.unlocked
                ? `
                  <span class="movieAccess unlocked">
                    НЭЭЛТТЭЙ
                  </span>
                `
                : `
                  <span class="movieAccess locked">
                    3,000₮
                  </span>
                `;

            return `
              <article
                class="movieCard"
                data-movie-id="${movie.id}"
              >

                <div class="moviePosterWrap">
                  ${poster}
                  ${status}
                </div>

                <div class="movieMeta">

                  <span class="eyebrow">
                    ${escapeHtml(movie.genre || 'DRAMA')}
                  </span>

                  <h3>
                    ${escapeHtml(movie.title || '')}
                  </h3>

                  <p>
                    ${Number(movie.duration_minutes || 0)}
                    мин • 720p
                  </p>

                </div>

              </article>
            `;
          }
        )
        .join('');

    grid
      .querySelectorAll(
        '[data-movie-id]'
      )
      .forEach(
        card => {
          card.addEventListener(
            'click',
            () => {
              openMovieDetail(
                Number(
                  card.dataset.movieId
                )
              );
            }
          );
        }
      );
  }

  function openMovieDetail(movieId) {
    const movie =
      state.movies.find(
        m =>
          Number(m.id) ===
          Number(movieId)
      );

    if (!movie) return;

    state.selectedMovie =
      movie;

    if ($('detailPoster')) {
      $('detailPoster').src =
        movie.poster_url || '';

      $('detailPoster').alt =
        movie.title || '';

      $('detailPoster').style.display =
        movie.poster_url
          ? ''
          : 'none';
    }

    if ($('detailGenre')) {
      $('detailGenre').textContent =
        movie.genre ||
        'DRAMA';
    }

    if ($('detailTitle')) {
      $('detailTitle').textContent =
        movie.title ||
        '';
    }

    if ($('detailDesc')) {
      $('detailDesc').textContent =
        movie.description ||
        'Тайлбар оруулаагүй байна.';
    }

    const priceRow =
      document.querySelector(
        '#detailModal .priceRow'
      );

    if (priceRow) {
      priceRow
        .classList
        .toggle(
          'hidden',
          !!movie.unlocked
        );
    }

    $('playBtn')
      ?.classList
      .toggle(
        'hidden',
        !movie.unlocked
      );

    openModal(
      'detailModal'
    );
  }

  async function startPurchase(type) {
    if (!requireLogin()) {
      return;
    }

    if (
      type === 'movie' &&
      !state.selectedMovie
    ) {
      alert(
        'Кино сонгоно уу.'
      );

      return;
    }

    const body =
      type === 'subscription'
        ? {
            type:
              'subscription'
          }
        : {
            type:
              'movie',

            movie_id:
              state.selectedMovie.id
          };

    try {
      const data =
        await api(
          '/api/purchases',
          {
            method:
              'POST',

            body
          }
        );

      state.currentPurchase =
        data.purchase;

      if ($('payTitle')) {
        $('payTitle').textContent =
          type === 'subscription'
            ? '30 хоногийн эрх • 5,000₮'
            : `${state.selectedMovie?.title || 'Кино'} • 3,000₮`;
      }

      if ($('bankName')) {
        $('bankName').textContent =
          data.payment?.bank_name ||
          '';
      }

      if ($('bankAccount')) {
        $('bankAccount').textContent =
          data.payment?.account_number ||
          '';
      }

      if ($('bankOwner')) {
        $('bankOwner').textContent =
          data.payment?.account_name ||
          '';
      }

      if ($('payRef')) {
        $('payRef').textContent =
          data.purchase?.reference_code ||
          '';
      }

      const confirmBtn =
        $('confirmPaymentBtn');

      const statusEl =
        $('paymentStatus');

      if (
        data.purchase?.status ===
        'pending'
      ) {
        if (confirmBtn) {
          confirmBtn.disabled =
            true;

          confirmBtn.textContent =
            'Төлбөр шалгагдаж байна';
        }

        showMessage(
          statusEl,
          'Таны төлбөрийн мэдэгдэл админд очсон байна.'
        );

      } else {
        if (confirmBtn) {
          confirmBtn.disabled =
            false;

          confirmBtn.textContent =
            'Би төлбөрөө шилжүүлсэн';
        }

        showMessage(
          statusEl,
          'Шилжүүлсний дараа дээрх товчийг дарна уу.'
        );
      }

      openModal(
        'paymentModal'
      );

    } catch (error) {
      if (
        error.status === 401
      ) {
        state.user = null;

        updateAccountUI();

        setAuthMode(
          'login'
        );

        openModal(
          'authModal'
        );

        return;
      }

      alert(
        error.message ||
        'Төлбөрийн хүсэлт үүсгэж чадсангүй.'
      );
    }
  }

  async function confirmPayment() {
    const purchase =
      state.currentPurchase;

    if (!purchase?.id) {
      alert(
        'Төлбөрийн хүсэлт олдсонгүй.'
      );

      return;
    }

    const button =
      $('confirmPaymentBtn');

    setButtonBusy(
      button,
      true,
      'Илгээж байна...'
    );

    try {
      await api(
        `/api/purchases/${purchase.id}/confirm`,
        {
          method:
            'POST'
        }
      );

      state.currentPurchase.status =
        'pending';

      if (button) {
        button.disabled =
          true;

        button.textContent =
          'Төлбөр шалгагдаж байна';

        delete button.dataset.oldText;
      }

      showMessage(
        $('paymentStatus'),
        '✓ Төлбөрийн мэдэгдэл админд амжилттай очлоо. Баталгаажмагц эрх нээгдэнэ.'
      );

    } catch (error) {
      showMessage(
        $('paymentStatus'),
        error.message ||
          'Мэдэгдэл илгээж чадсангүй.',
        true
      );

      setButtonBusy(
        button,
        false
      );
    }
  }

  async function playSelectedMovie() {
    if (!requireLogin()) {
      return;
    }

    if (!state.selectedMovie) {
      return;
    }

    const button =
      $('playBtn');

    setButtonBusy(
      button,
      true,
      'Уншиж байна...'
    );

    try {
      const data =
        await api(
          `/api/stream-url/${state.selectedMovie.id}`
        );

      const video =
        $('video');

      if (!video) {
        return;
      }

      video.src =
        data.url;

      video.load();

      if ($('playerTitle')) {
        $('playerTitle').textContent =
          state.selectedMovie.title ||
          '';
      }

      openModal(
        'playerModal'
      );

      video
        .play()
        .catch(
          () => {}
        );

    } catch (error) {
      if (
        error.status === 403
      ) {
        alert(
          'Энэ киног үзэх эрх одоогоор нээгдээгүй байна.'
        );
      } else {
        alert(
          error.message ||
          'Видео нээж чадсангүй.'
        );
      }

    } finally {
      setButtonBusy(
        button,
        false
      );
    }
  }

  function updateProgress(
    bar,
    textEl,
    percent,
    text
  ) {
    if (bar) {
      bar.style.width =
        `${Math.max(
          0,
          Math.min(
            100,
            percent
          )
        )}%`;
    }

    if (textEl) {
      textEl.textContent =
        text || '';
    }
  }

  async function uploadFile(
    kind,
    file,
    onProgress
  ) {
    if (!file) {
      return null;
    }

    const signed =
      await api(
        '/api/admin/upload-url',
        {
          method:
            'POST',

          body: {
            kind,

            file_name:
              file.name
          }
        }
      );

    await new Promise(
      (resolve, reject) => {
        const xhr =
          new XMLHttpRequest();

        xhr.open(
          'PUT',
          signed.url,
          true
        );

        if (file.type) {
          xhr.setRequestHeader(
            'Content-Type',
            file.type
          );
        }

        xhr.upload.onprogress =
          event => {
            if (
              event.lengthComputable &&
              typeof onProgress ===
                'function'
            ) {
              onProgress(
                Math.round(
                  event.loaded /
                  event.total *
                  100
                )
              );
            }
          };

        xhr.onload =
          () => {
            if (
              xhr.status >= 200 &&
              xhr.status < 300
            ) {
              resolve();
            } else {
              reject(
                new Error(
                  `R2 upload failed (${xhr.status})`
                )
              );
            }
          };

        xhr.onerror =
          () => {
            reject(
              new Error(
                'Upload хийх үед сүлжээний алдаа гарлаа.'
              )
            );
          };

        xhr.send(file);
      }
    );

    return signed.key;
  }

  async function handleMovieCreate(event) {
    event.preventDefault();

    if (
      state.user?.role !==
      'admin'
    ) {
      alert(
        'Admin эрх шаардлагатай.'
      );

      return;
    }

    const form =
      $('movieForm');

    const submit =
      form?.querySelector(
        'button[type="submit"]'
      );

    const bar =
      $('uploadBar');

    const textEl =
      $('uploadText');

    const videoFile =
      $('videoFile')
        ?.files?.[0];

    const posterFile =
      $('posterFile')
        ?.files?.[0];

    if (!videoFile) {
      alert(
        'MP4 видеогоо сонгоно уу.'
      );

      return;
    }

    setButtonBusy(
      submit,
      true,
      'Upload хийж байна...'
    );

    try {
      let posterKey =
        null;

      if (posterFile) {
        updateProgress(
          bar,
          textEl,
          0,
          'Poster upload...'
        );

        posterKey =
          await uploadFile(
            'poster',
            posterFile,
            p =>
              updateProgress(
                bar,
                textEl,
                p,
                `Poster ${p}%`
              )
          );
      }

      updateProgress(
        bar,
        textEl,
        0,
        'Видео upload...'
      );

      const videoKey =
        await uploadFile(
          'video',
          videoFile,
          p =>
            updateProgress(
              bar,
              textEl,
              p,
              `Видео ${p}%`
            )
        );

      updateProgress(
        bar,
        textEl,
        100,
        'Кино үүсгэж байна...'
      );

      await api(
        '/api/admin/movies',
        {
          method:
            'POST',

          body: {
            title:
              $('mTitle')
                ?.value
                .trim(),

            description:
              $('mDesc')
                ?.value
                .trim(),

            genre:
              $('mGenre')
                ?.value
                .trim() ||
              'drama',

            duration_minutes:
              Number(
                $('mDuration')
                  ?.value ||
                90
              ),

            video_key:
              videoKey,

            poster_key:
              posterKey
          }
        }
      );

      form?.reset();

      if ($('mGenre')) {
        $('mGenre').value =
          'drama';
      }

      if ($('mDuration')) {
        $('mDuration').value =
          '90';
      }

      updateProgress(
        bar,
        textEl,
        100,
        '✓ Кино амжилттай нэмэгдлээ.'
      );

      await loadMovies();

    } catch (error) {
      updateProgress(
        bar,
        textEl,
        0,
        `Алдаа: ${error.message}`
      );

    } finally {
      setButtonBusy(
        submit,
        false
      );
    }
  }

  function renderAdminMovies() {
    const container =
      $('adminMovies');

    if (!container) {
      return;
    }

    if (
      state.user?.role !==
      'admin'
    ) {
      container.innerHTML =
        '';

      return;
    }

    if (
      !state.movies.length
    ) {
      container.innerHTML =
        '<p class="muted">Кино алга байна.</p>';

      return;
    }

    container.innerHTML =
      state.movies
        .map(
          movie => `
            <div
              class="adminMovieRow"
              data-admin-movie="${movie.id}"
            >

              <div class="adminMovieInfo">

                <b>
                  ${escapeHtml(movie.title || '')}
                </b>

                <span>
                  ${escapeHtml(movie.genre || 'drama')}
                  •
                  ${Number(movie.duration_minutes || 0)}
                  мин
                </span>

              </div>

              <div class="adminMovieActions">

                <button
                  class="btn glass adminEditMovie"
                  type="button"
                  data-id="${movie.id}"
                >
                  ✏️ Засах
                </button>

                <button
                  class="btn glass adminDeleteMovie"
                  type="button"
                  data-id="${movie.id}"
                >
                  🗑️ Устгах
                </button>

              </div>

            </div>
          `
        )
        .join('');

    container
      .querySelectorAll(
        '.adminEditMovie'
      )
      .forEach(
        button => {
          button.addEventListener(
            'click',
            () =>
              openEditMovie(
                Number(
                  button.dataset.id
                )
              )
          );
        }
      );

    container
      .querySelectorAll(
        '.adminDeleteMovie'
      )
      .forEach(
        button => {
          button.addEventListener(
            'click',
            () =>
              deleteMovie(
                Number(
                  button.dataset.id
                )
              )
          );
        }
      );
  }

  function openEditMovie(movieId) {
    const movie =
      state.movies.find(
        m =>
          Number(m.id) ===
          Number(movieId)
      );

    if (!movie) {
      return;
    }

    state.editingMovie =
      movie;

    if ($('editMovieId')) {
      $('editMovieId').value =
        movie.id;
    }

    if ($('editTitle')) {
      $('editTitle').value =
        movie.title || '';
    }

    if ($('editGenre')) {
      $('editGenre').value =
        movie.genre || '';
    }

    if ($('editDesc')) {
      $('editDesc').value =
        movie.description || '';
    }

    if ($('editDuration')) {
      $('editDuration').value =
        movie.duration_minutes ||
        90;
    }

    if ($('editPosterFile')) {
      $('editPosterFile').value =
        '';
    }

    if ($('editVideoFile')) {
      $('editVideoFile').value =
        '';
    }

    updateProgress(
      $('editUploadBar'),
      $('editUploadText'),
      0,
      ''
    );

    openModal(
      'editMovieModal'
    );
  }

  async function handleMovieEdit(event) {
    event.preventDefault();

    if (
      state.user?.role !==
      'admin'
    ) {
      alert(
        'Admin эрх шаардлагатай.'
      );

      return;
    }

    const movieId =
      Number(
        $('editMovieId')
          ?.value ||
        state.editingMovie
          ?.id
      );

    if (!movieId) {
      alert(
        'Кино олдсонгүй.'
      );

      return;
    }

    const submit =
      $('editMovieForm')
        ?.querySelector(
          'button[type="submit"]'
        );

    const bar =
      $('editUploadBar');

    const textEl =
      $('editUploadText');

    setButtonBusy(
      submit,
      true,
      'Хадгалж байна...'
    );

    try {
      const body = {
        title:
          $('editTitle')
            ?.value
            .trim(),

        description:
          $('editDesc')
            ?.value
            .trim(),

        genre:
          $('editGenre')
            ?.value
            .trim() ||
          'drama',

        duration_minutes:
          Number(
            $('editDuration')
              ?.value ||
            90
          )
      };

      const posterFile =
        $('editPosterFile')
          ?.files?.[0];

      const videoFile =
        $('editVideoFile')
          ?.files?.[0];

      if (posterFile) {
        updateProgress(
          bar,
          textEl,
          0,
          'Шинэ poster upload...'
        );

        body.poster_key =
          await uploadFile(
            'poster',
            posterFile,
            p =>
              updateProgress(
                bar,
                textEl,
                p,
                `Poster ${p}%`
              )
          );
      }

      if (videoFile) {
        updateProgress(
          bar,
          textEl,
          0,
          'Шинэ видео upload...'
        );

        body.video_key =
          await uploadFile(
            'video',
            videoFile,
            p =>
              updateProgress(
                bar,
                textEl,
                p,
                `Видео ${p}%`
              )
          );
      }

      updateProgress(
        bar,
        textEl,
        100,
        'Өөрчлөлт хадгалж байна...'
      );

      await api(
        `/api/admin/movies/${movieId}`,
        {
          method:
            'PUT',

          body
        }
      );

      await loadMovies();

      updateProgress(
        bar,
        textEl,
        100,
        '✓ Амжилттай хадгаллаа.'
      );

      setTimeout(
        () => {
          closeModal(
            'editMovieModal'
          );
        },
        500
      );

    } catch (error) {
      updateProgress(
        bar,
        textEl,
        0,
        `Алдаа: ${error.message}`
      );

    } finally {
      setButtonBusy(
        submit,
        false
      );
    }
  }

  async function deleteMovie(movieId) {
    if (
      state.user?.role !==
      'admin'
    ) {
      return;
    }

    const movie =
      state.movies.find(
        m =>
          Number(m.id) ===
          Number(movieId)
      );

    const name =
      movie?.title ||
      `#${movieId}`;

    const yes =
      confirm(
        `"${name}" киног бүр мөсөн устгах уу?\n\nВидео болон poster R2-оос мөн устна.`
      );

    if (!yes) {
      return;
    }

    try {
      await api(
        `/api/admin/movies/${movieId}`,
        {
          method:
            'DELETE'
        }
      );

      if (
        Number(
          state.editingMovie?.id
        ) ===
        Number(movieId)
      ) {
        state.editingMovie =
          null;

        closeModal(
          'editMovieModal'
        );
      }

      if (
        Number(
          state.selectedMovie?.id
        ) ===
        Number(movieId)
      ) {
        state.selectedMovie =
          null;

        closeModal(
          'detailModal'
        );
      }

      await loadMovies();

      alert(
        'Кино устгагдлаа.'
      );

    } catch (error) {
      alert(
        error.message ||
        'Кино устгаж чадсангүй.'
      );
    }
  }

  async function loadAdminPurchases() {
    const container =
      $('adminPurchases');

    if (
      !container ||
      state.user?.role !==
      'admin'
    ) {
      return;
    }

    container.innerHTML =
      '<p class="muted">Уншиж байна...</p>';

    try {
      const data =
        await api(
          '/api/admin/purchases'
        );

      const purchases =
        Array.isArray(
          data.purchases
        )
          ? data.purchases
          : [];

      if (
        !purchases.length
      ) {
        container.innerHTML =
          '<p class="muted">Хүлээгдэж буй төлбөр алга байна.</p>';

        return;
      }

      container.innerHTML =
        purchases
          .map(
            p => `
              <div class="purchaseRow">

                <div class="purchaseInfo">

                  <b>
                    ${escapeHtml(
                      p.name ||
                      p.email ||
                      'Хэрэглэгч'
                    )}
                  </b>

                  <span>
                    ${escapeHtml(p.email || '')}
                  </span>

                  <span>
                    ${
                      p.type ===
                      'subscription'
                        ? '30 хоногийн эрх'
                        : escapeHtml(
                            p.movie_title ||
                            `Кино #${p.movie_id}`
                          )
                    }
                  </span>

                  <span>
                    ${money(p.amount)}
                    • Утга:
                    <strong>
                      ${escapeHtml(p.reference_code || '')}
                    </strong>
                  </span>

                </div>

                <div class="purchaseActions">

                  <button
                    class="btn primary approvePurchase"
                    type="button"
                    data-id="${p.id}"
                  >
                    ✓ Батлах
                  </button>

                  <button
                    class="btn glass rejectPurchase"
                    type="button"
                    data-id="${p.id}"
                  >
                    ✕ Татгалзах
                  </button>

                </div>

              </div>
            `
          )
          .join('');

      container
        .querySelectorAll(
          '.approvePurchase'
        )
        .forEach(
          button => {
            button.addEventListener(
              'click',
              () =>
                adminPurchaseAction(
                  Number(
                    button.dataset.id
                  ),
                  'approve',
                  button
                )
            );
          }
        );

      container
        .querySelectorAll(
          '.rejectPurchase'
        )
        .forEach(
          button => {
            button.addEventListener(
              'click',
              () =>
                adminPurchaseAction(
                  Number(
                    button.dataset.id
                  ),
                  'reject',
                  button
                )
            );
          }
        );

    } catch (error) {
      container.innerHTML =
        `<p class="error">${escapeHtml(error.message)}</p>`;
    }
  }

  async function adminPurchaseAction(
    purchaseId,
    action,
    button
  ) {
    const label =
      action === 'approve'
        ? 'Батлах'
        : 'Татгалзах';

    if (
      !confirm(
        `${label} үйлдлийг хийх үү?`
      )
    ) {
      return;
    }

    setButtonBusy(
      button,
      true,
      '...'
    );

    try {
      await api(
        `/api/admin/purchases/${purchaseId}/${action}`,
        {
          method:
            'POST'
        }
      );

      await loadAdminPurchases();
      await loadMovies();

    } catch (error) {
      alert(
        error.message ||
        'Алдаа гарлаа.'
      );

      setButtonBusy(
        button,
        false
      );
    }
  }

  async function openAdmin() {
    if (
      state.user?.role !==
      'admin'
    ) {
      alert(
        'Admin эрх шаардлагатай.'
      );

      return;
    }

    renderAdminMovies();

    openModal(
      'adminModal'
    );

    await loadAdminPurchases();
  }

  function injectExtraStyles() {
    const style =
      document.createElement(
        'style'
      );

    style.textContent = `
      .movieCard {
        cursor: pointer;
      }

      .moviePosterWrap {
        position: relative;
        overflow: hidden;
        border-radius: 16px;
      }

      .moviePosterWrap img {
        width: 100%;
        display: block;
        aspect-ratio: 2 / 3;
        object-fit: cover;
      }

      .moviePosterFallback {
        aspect-ratio: 2 / 3;
        display: grid;
        place-items: center;
        background: #14141d;
        font-weight: 900;
        font-size: 28px;
      }

      .movieAccess {
        position: absolute;
        right: 10px;
        top: 10px;
        padding: 7px 10px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 800;
        background: rgba(0,0,0,.75);
      }

      .movieAccess.unlocked {
        background: #fff;
        color: #09090d;
      }

      .movieMeta h3 {
        margin: 8px 0 4px;
      }

      .movieMeta p {
        margin: 0;
        opacity: .65;
        font-size: 13px;
      }

      #adminMovies,
      #adminPurchases {
        display: grid;
        gap: 10px;
      }

      .adminMovieRow,
      .purchaseRow {
        display: flex;
        gap: 14px;
        align-items: center;
        justify-content: space-between;
        padding: 14px;
        border: 1px solid rgba(255,255,255,.1);
        border-radius: 14px;
        background: rgba(255,255,255,.025);
      }

      .adminMovieInfo,
      .purchaseInfo {
        min-width: 0;
        display: grid;
        gap: 4px;
      }

      .adminMovieInfo span,
      .purchaseInfo span {
        opacity: .72;
        font-size: 13px;
        overflow-wrap: anywhere;
      }

      .adminMovieActions,
      .purchaseActions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .adminMovieActions .btn,
      .purchaseActions .btn {
        width: auto;
        min-width: 96px;
      }

      #paymentStatus {
        margin-top: 12px;
      }

      #confirmPaymentBtn {
        margin-top: 10px;
        margin-bottom: 8px;
      }

      @media (max-width: 700px) {
        .adminMovieRow,
        .purchaseRow {
          align-items: stretch;
          flex-direction: column;
        }

        .adminMovieActions,
        .purchaseActions {
          justify-content: stretch;
        }

        .adminMovieActions .btn,
        .purchaseActions .btn {
          flex: 1;
        }
      }
    `;

    document.head
      .appendChild(style);
  }

  function bindEvents() {
    document
      .querySelectorAll('.modal')
      .forEach(
        modal => {
          modal.style.display =
            'none';
        }
      );

    document
      .querySelectorAll(
        '[data-close]'
      )
      .forEach(
        el => {
          el.addEventListener(
            'click',
            () => {
              const modal =
                el.closest(
                  '.modal'
                );

              closeModal(
                modal
              );
            }
          );
        }
      );

    document
      .querySelectorAll(
        '[data-tab]'
      )
      .forEach(
        button => {
          button.addEventListener(
            'click',
            () =>
              setAuthMode(
                button.dataset.tab
              )
          );
        }
      );

    $('authForm')
      ?.addEventListener(
        'submit',
        handleAuthSubmit
      );

    $('authBtn')
      ?.addEventListener(
        'click',
        async () => {
          if (!state.user) {
            setAuthMode(
              'login'
            );

            openModal(
              'authModal'
            );

            return;
          }

          const yes =
            confirm(
              'Аккаунтаас гарах уу?'
            );

          if (yes) {
            await logout();
          }
        }
      );

    $('search')
      ?.addEventListener(
        'input',
        renderMovies
      );

    $('buyMovieBtn')
      ?.addEventListener(
        'click',
        () =>
          startPurchase(
            'movie'
          )
      );

    $('buySubBtn')
      ?.addEventListener(
        'click',
        () =>
          startPurchase(
            'subscription'
          )
      );

    $('subBtn')
      ?.addEventListener(
        'click',
        () =>
          startPurchase(
            'subscription'
          )
      );

    $('subBtn2')
      ?.addEventListener(
        'click',
        () =>
          startPurchase(
            'subscription'
          )
      );

    $('confirmPaymentBtn')
      ?.addEventListener(
        'click',
        confirmPayment
      );

    $('playBtn')
      ?.addEventListener(
        'click',
        playSelectedMovie
      );

    $('adminBtn')
      ?.addEventListener(
        'click',
        openAdmin
      );

    $('movieForm')
      ?.addEventListener(
        'submit',
        handleMovieCreate
      );

    $('editMovieForm')
      ?.addEventListener(
        'submit',
        handleMovieEdit
      );

    $('deleteMovieBtn')
      ?.addEventListener(
        'click',
        () => {
          const id =
            Number(
              $('editMovieId')
                ?.value ||
              state.editingMovie
                ?.id
            );

          if (id) {
            deleteMovie(id);
          }
        }
      );

    document
      .addEventListener(
        'keydown',
        event => {
          if (
            event.key ===
            'Escape'
          ) {
            const open =
              [
                ...document.querySelectorAll(
                  '.modal'
                )
              ]
                .reverse()
                .find(
                  m =>
                    m.style.display ===
                    'flex'
                );

            if (open) {
              closeModal(
                open
              );
            }
          }
        }
      );
  }

  async function init() {
    injectExtraStyles();

    bindEvents();

    setAuthMode(
      'login'
    );

    try {
      await refreshSession();
    } catch (error) {
      console.error(
        'Session load failed:',
        error
      );
    }

    try {
      await loadMovies();
    } catch (error) {
      console.error(
        'Movie load failed:',
        error
      );

      if ($('emptyState')) {
        $('emptyState')
          .classList
          .remove(
            'hidden'
          );

        $('emptyState').textContent =
          'Кино жагсаалтыг ачаалж чадсангүй.';
      }
    }
  }

  init();

})();
