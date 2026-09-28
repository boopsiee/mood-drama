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

  let adminRefreshTimer = null;

  function esc(v = '') {
    return String(v)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function money(v) {
    return `${Number(v || 0).toLocaleString('mn-MN')}₮`;
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

    const res = await fetch(url, opts);
    const raw = await res.text();

    let data = {};

    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        data = {
          error: raw
        };
      }
    }

    if (!res.ok) {
      let msg =
        data?.error ||
        `HTTP ${res.status}`;

      if (
        typeof msg === 'string' &&
        msg
          .trim()
          .toLowerCase()
          .startsWith('<!doctype html')
      ) {
        msg =
          `Server error (${res.status}). Backend deployment-ээ шалгана уу.`;
      }

      const err =
        new Error(msg);

      err.status =
        res.status;

      throw err;
    }

    return data;
  }

  function openModal(id) {
    const el = $(id);

    if (!el) {
      return;
    }

    el.classList.add(
      'open',
      'active'
    );

    el.style.display =
      'flex';

    el.style.alignItems =
      'center';

    el.style.justifyContent =
      'center';

    document.body.style.overflow =
      'hidden';
  }

  function closeModal(modalOrId) {
    const el =
      typeof modalOrId === 'string'
        ? $(modalOrId)
        : modalOrId;

    if (!el) {
      return;
    }

    el.classList.remove(
      'open',
      'active'
    );

    el.style.display =
      'none';

    el.style.alignItems =
      '';

    el.style.justifyContent =
      '';

    if (
      el.id ===
      'playerModal'
    ) {
      const video =
        $('video');

      if (video) {
        video.pause();

        video.removeAttribute(
          'src'
        );

        video.load();
      }
    }

    if (
      el.id ===
      'adminModal'
    ) {
      clearInterval(
        adminRefreshTimer
      );

      adminRefreshTimer =
        null;
    }

    const anyOpen =
      [
        ...document.querySelectorAll(
          '.modal'
        )
      ]
        .some(
          x =>
            x.style.display ===
            'flex'
        );

    if (!anyOpen) {
      document.body.style.overflow =
        '';
    }
  }

  function closeAllModals() {
    document
      .querySelectorAll(
        '.modal'
      )
      .forEach(
        closeModal
      );
  }

  function busy(
    btn,
    yes,
    text = 'Түр хүлээнэ үү...'
  ) {
    if (!btn) {
      return;
    }

    if (yes) {
      if (
        !btn.dataset.oldText
      ) {
        btn.dataset.oldText =
          btn.textContent;
      }

      btn.disabled =
        true;

      btn.textContent =
        text;

    } else {
      btn.disabled =
        false;

      if (
        btn.dataset.oldText
      ) {
        btn.textContent =
          btn.dataset.oldText;

        delete btn.dataset.oldText;
      }
    }
  }

  function message(
    el,
    text,
    error = false
  ) {
    if (!el) {
      return;
    }

    el.textContent =
      text || '';

    el.style.color =
      error
        ? '#ff6b6b'
        : '';
  }

  function setAuthMode(mode) {
    state.authMode =
      mode === 'register'
        ? 'register'
        : 'login';

    const isRegister =
      state.authMode ===
      'register';

    document
      .querySelectorAll(
        '[data-tab]'
      )
      .forEach(
        btn => {
          btn.classList.toggle(
            'active',
            btn.dataset.tab ===
              state.authMode
          );
        }
      );

    $('nameLabel')
      ?.classList
      .toggle(
        'hidden',
        !isRegister
      );

    if (
      $('nameInput')
    ) {
      $('nameInput').required =
        isRegister;
    }

    if (
      $('authTitle')
    ) {
      $('authTitle').textContent =
        isRegister
          ? 'Бүртгүүлэх'
          : 'Нэвтрэх';
    }

    if (
      $('authSubmit')
    ) {
      $('authSubmit').textContent =
        isRegister
          ? 'Бүртгүүлэх'
          : 'Нэвтрэх';
    }

    message(
      $('authError'),
      ''
    );
  }

  function requireLogin() {
    if (
      state.user
    ) {
      return true;
    }

    closeAllModals();

    setAuthMode(
      'login'
    );

    openModal(
      'authModal'
    );

    return false;
  }

  function updateAccountUI() {
    const isAdmin =
      state.user?.role ===
      'admin';

    $('adminBtn')
      ?.classList
      .toggle(
        'hidden',
        !isAdmin
      );

    if (
      !state.user
    ) {
      if (
        $('authBtn')
      ) {
        $('authBtn').textContent =
          'Нэвтрэх';
      }

      if (
        $('accountLine')
      ) {
        $('accountLine').textContent =
          'Нэвтрээгүй';
      }

      return;
    }

    if (
      $('authBtn')
    ) {
      $('authBtn').textContent =
        state.user.name ||
        state.user.email;
    }

    if (
      $('accountLine')
    ) {
      let text =
        state.user.name ||
        state.user.email;

      if (
        state.subscriptionExpiresAt &&
        Number(
          state.subscriptionExpiresAt
        ) >
        Date.now()
      ) {
        text +=
          ` • Premium ${new Date(
            Number(
              state.subscriptionExpiresAt
            )
          ).toLocaleDateString(
            'mn-MN'
          )} хүртэл`;
      }

      $('accountLine').textContent =
        text;
    }
  }

  async function refreshSession() {
    const data =
      await api(
        '/api/me'
      );

    state.user =
      data.user ||
      null;

    state.subscriptionExpiresAt =
      data.subscription_expires_at ||
      null;

    updateAccountUI();
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();

    const btn =
      $('authSubmit');

    busy(
      btn,
      true
    );

    message(
      $('authError'),
      ''
    );

    try {
      const body = {
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
        body.name =
          $('nameInput')
            ?.value
            .trim();
      }

      await api(
        state.authMode ===
        'register'
          ? '/api/register'
          : '/api/login',
        {
          method:
            'POST',

          body
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

    } catch (err) {
      message(
        $('authError'),
        err.message ||
        'Алдаа гарлаа.',
        true
      );

    } finally {
      busy(
        btn,
        false
      );
    }
  }

  async function logout() {
    try {
      await api(
        '/api/logout',
        {
          method:
            'POST'
        }
      );
    } catch {}

    state.user =
      null;

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

    if (!grid) {
      return;
    }

    const q =
      ($('search')?.value || '')
        .trim()
        .toLowerCase();

    const list =
      state.movies.filter(
        m => {
          if (!q) {
            return true;
          }

          return [
            m.title,
            m.genre,
            m.description
          ]
            .filter(Boolean)
            .some(
              v =>
                String(v)
                  .toLowerCase()
                  .includes(q)
            );
        }
      );

    empty
      ?.classList
      .toggle(
        'hidden',
        list.length > 0
      );

    grid.innerHTML =
      list
        .map(
          m => `
            <article
              class="movieCard"
              data-movie-id="${m.id}"
            >

              <div class="moviePosterWrap">

                ${
                  m.poster_url
                    ? `
                      <img
                        src="${esc(m.poster_url)}"
                        alt="${esc(m.title)}"
                        loading="lazy"
                      >
                    `
                    : `
                      <div class="moviePosterFallback">
                        MOOD
                      </div>
                    `
                }

                <span
                  class="movieAccess ${
                    m.unlocked
                      ? 'unlocked'
                      : 'locked'
                  }"
                >
                  ${
                    m.unlocked
                      ? 'НЭЭЛТТЭЙ'
                      : '3,000₮'
                  }
                </span>

              </div>

              <div class="movieMeta">

                <span class="eyebrow">
                  ${esc(m.genre || 'DRAMA')}
                </span>

                <h3>
                  ${esc(m.title || '')}
                </h3>

                <p>
                  ${Number(m.duration_minutes || 0)}
                  мин • 720p
                </p>

              </div>

            </article>
          `
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

  function openMovieDetail(id) {
    const m =
      state.movies.find(
        x =>
          Number(x.id) ===
          Number(id)
      );

    if (!m) {
      return;
    }

    state.selectedMovie =
      m;

    if (
      $('detailPoster')
    ) {
      $('detailPoster').src =
        m.poster_url ||
        '';

      $('detailPoster').alt =
        m.title ||
        '';

      $('detailPoster').style.display =
        m.poster_url
          ? ''
          : 'none';
    }

    if (
      $('detailGenre')
    ) {
      $('detailGenre').textContent =
        m.genre ||
        'DRAMA';
    }

    if (
      $('detailTitle')
    ) {
      $('detailTitle').textContent =
        m.title ||
        '';
    }

    if (
      $('detailDesc')
    ) {
      $('detailDesc').textContent =
        m.description ||
        'Тайлбар оруулаагүй байна.';
    }

    const priceRow =
      document.querySelector(
        '#detailModal .priceRow'
      );

    priceRow
      ?.classList
      .toggle(
        'hidden',
        !!m.unlocked
      );

    $('playBtn')
      ?.classList
      .toggle(
        'hidden',
        !m.unlocked
      );

    openModal(
      'detailModal'
    );
  }

  async function startPurchase(type) {
    if (
      !requireLogin()
    ) {
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
      type ===
      'subscription'
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

      if (
        $('payTitle')
      ) {
        $('payTitle').textContent =
          type ===
          'subscription'
            ? '30 хоногийн эрх • 5,000₮'
            : `${state.selectedMovie?.title || 'Кино'} • 3,000₮`;
      }

      if (
        $('bankName')
      ) {
        $('bankName').textContent =
          data.payment?.bank_name ||
          '';
      }

      if (
        $('bankAccount')
      ) {
        $('bankAccount').textContent =
          data.payment?.account_number ||
          '';
      }

      if (
        $('bankOwner')
      ) {
        $('bankOwner').textContent =
          data.payment?.account_name ||
          '';
      }

      if (
        $('payRef')
      ) {
        $('payRef').textContent =
          data.purchase?.reference_code ||
          '';
      }

      const confirmBtn =
        $('confirmPaymentBtn');

      /*
        ЧУХАЛ:

        status = pending
        гэдэг нь шууд Admin-д очсон гэсэн үг БИШ.

        confirmed = true
        эсвэл
        approved_at = -1

        болсон үед л Admin-д очсон.
      */

      const sentToAdmin =
        data.purchase?.confirmed ===
          true ||
        Number(
          data.purchase?.approved_at
        ) === -1;

      if (
        sentToAdmin
      ) {
        if (
          confirmBtn
        ) {
          confirmBtn.disabled =
            true;

          confirmBtn.textContent =
            'Төлбөр шалгагдаж байна';
        }

        message(
          $('paymentStatus'),
          '✓ Төлбөрийн мэдэгдэл админд очсон байна.'
        );

      } else {
        if (
          confirmBtn
        ) {
          confirmBtn.disabled =
            false;

          confirmBtn.textContent =
            'Би төлбөрөө шилжүүлсэн';
        }

        message(
          $('paymentStatus'),
          'Шилжүүлсний дараа дээрх товчийг дарна уу.'
        );
      }

      openModal(
        'paymentModal'
      );

    } catch (err) {
      if (
        err.status ===
        401
      ) {
        state.user =
          null;

        updateAccountUI();

        closeAllModals();

        setAuthMode(
          'login'
        );

        openModal(
          'authModal'
        );

        return;
      }

      alert(
        err.message ||
        'Төлбөрийн хүсэлт үүсгэж чадсангүй.'
      );
    }
  }

  async function confirmPayment() {
    const p =
      state.currentPurchase;

    if (
      !p?.id
    ) {
      alert(
        'Төлбөрийн хүсэлт олдсонгүй.'
      );

      return;
    }

    const btn =
      $('confirmPaymentBtn');

    busy(
      btn,
      true,
      'Илгээж байна...'
    );

    try {
      const data =
        await api(
          `/api/purchases/${p.id}/confirm`,
          {
            method:
              'POST'
          }
        );

      state.currentPurchase.status =
        'pending';

      state.currentPurchase.confirmed =
        true;

      state.currentPurchase.approved_at =
        -1;

      if (
        btn
      ) {
        btn.disabled =
          true;

        btn.textContent =
          'Төлбөр шалгагдаж байна';

        delete btn.dataset.oldText;
      }

      message(
        $('paymentStatus'),
        '✓ Админд амжилттай илгээлээ. Баталгаажмагц эрх нээгдэнэ.'
      );

      console.log(
        'Payment confirmed:',
        data
      );

    } catch (err) {
      message(
        $('paymentStatus'),
        err.message ||
        'Мэдэгдэл илгээж чадсангүй.',
        true
      );

      busy(
        btn,
        false
      );
    }
  }

  async function playSelectedMovie() {
    if (
      !requireLogin() ||
      !state.selectedMovie
    ) {
      return;
    }

    const btn =
      $('playBtn');

    busy(
      btn,
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

      if (
        $('playerTitle')
      ) {
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

    } catch (err) {
      alert(
        err.message ||
        'Видео нээж чадсангүй.'
      );

    } finally {
      busy(
        btn,
        false
      );
    }
  }

  function progress(
    bar,
    textEl,
    percent,
    text
  ) {
    if (
      bar
    ) {
      bar.style.width =
        `${Math.max(
          0,
          Math.min(
            100,
            percent
          )
        )}%`;
    }

    if (
      textEl
    ) {
      textEl.textContent =
        text ||
        '';
    }
  }

  async function uploadFile(
    kind,
    file,
    onProgress
  ) {
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
      (
        resolve,
        reject
      ) => {
        const xhr =
          new XMLHttpRequest();

        xhr.open(
          'PUT',
          signed.url,
          true
        );

        if (
          file.type
        ) {
          xhr.setRequestHeader(
            'Content-Type',
            file.type
          );
        }

        xhr.upload.onprogress =
          e => {
            if (
              e.lengthComputable &&
              onProgress
            ) {
              onProgress(
                Math.round(
                  (
                    e.loaded /
                    e.total
                  ) *
                  100
                )
              );
            }
          };

        xhr.onload =
          () => {
            if (
              xhr.status >=
                200 &&
              xhr.status <
                300
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
          () =>
            reject(
              new Error(
                'Upload хийх үед сүлжээний алдаа гарлаа.'
              )
            );

        xhr.send(
          file
        );
      }
    );

    return signed.key;
  }

  async function handleMovieCreate(e) {
    e.preventDefault();

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

    const btn =
      form
        ?.querySelector(
          'button[type="submit"]'
        );

    const bar =
      $('uploadBar');

    const textEl =
      $('uploadText');

    const poster =
      $('posterFile')
        ?.files?.[0];

    const video =
      $('videoFile')
        ?.files?.[0];

    if (
      !video
    ) {
      alert(
        'MP4 видеогоо сонгоно уу.'
      );

      return;
    }

    busy(
      btn,
      true,
      'Upload хийж байна...'
    );

    try {
      let posterKey =
        null;

      if (
        poster
      ) {
        posterKey =
          await uploadFile(
            'poster',
            poster,
            p => {
              progress(
                bar,
                textEl,
                p,
                `Poster ${p}%`
              );
            }
          );
      }

      const videoKey =
        await uploadFile(
          'video',
          video,
          p => {
            progress(
              bar,
              textEl,
              p,
              `Видео ${p}%`
            );
          }
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

      form
        ?.reset();

      if (
        $('mGenre')
      ) {
        $('mGenre').value =
          'drama';
      }

      if (
        $('mDuration')
      ) {
        $('mDuration').value =
          '90';
      }

      progress(
        bar,
        textEl,
        100,
        '✓ Кино амжилттай нэмэгдлээ.'
      );

      await loadMovies();

    } catch (err) {
      progress(
        bar,
        textEl,
        0,
        `Алдаа: ${err.message}`
      );

    } finally {
      busy(
        btn,
        false
      );
    }
  }

  function renderAdminMovies() {
    const box =
      $('adminMovies');

    if (!box) {
      return;
    }

    if (
      state.user?.role !==
      'admin'
    ) {
      box.innerHTML =
        '';

      return;
    }

    if (
      !state.movies.length
    ) {
      box.innerHTML =
        '<p class="muted">Кино алга байна.</p>';

      return;
    }

    box.innerHTML =
      state.movies
        .map(
          m => `
            <div class="adminMovieRow">

              <div class="adminMovieInfo">

                <b>
                  ${esc(m.title || '')}
                </b>

                <span>
                  ${esc(m.genre || 'drama')}
                  •
                  ${Number(m.duration_minutes || 0)}
                  мин
                </span>

              </div>

              <div class="adminMovieActions">

                <button
                  class="btn glass adminEditMovie"
                  type="button"
                  data-id="${m.id}"
                >
                  ✏️ Засах
                </button>

                <button
                  class="btn glass adminDeleteMovie"
                  type="button"
                  data-id="${m.id}"
                >
                  🗑️ Устгах
                </button>

              </div>

            </div>
          `
        )
        .join('');

    box
      .querySelectorAll(
        '.adminEditMovie'
      )
      .forEach(
        btn => {
          btn.addEventListener(
            'click',
            () => {
              openEditMovie(
                Number(
                  btn.dataset.id
                )
              );
            }
          );
        }
      );

    box
      .querySelectorAll(
        '.adminDeleteMovie'
      )
      .forEach(
        btn => {
          btn.addEventListener(
            'click',
            () => {
              deleteMovie(
                Number(
                  btn.dataset.id
                )
              );
            }
          );
        }
      );
  }

  function openEditMovie(id) {
    const m =
      state.movies.find(
        x =>
          Number(x.id) ===
          Number(id)
      );

    if (!m) {
      return;
    }

    state.editingMovie =
      m;

    $('editMovieId').value =
      m.id;

    $('editTitle').value =
      m.title ||
      '';

    $('editGenre').value =
      m.genre ||
      '';

    $('editDesc').value =
      m.description ||
      '';

    $('editDuration').value =
      m.duration_minutes ||
      90;

    $('editPosterFile').value =
      '';

    $('editVideoFile').value =
      '';

    progress(
      $('editUploadBar'),
      $('editUploadText'),
      0,
      ''
    );

    closeModal(
      'adminModal'
    );

    openModal(
      'editMovieModal'
    );
  }

  async function handleMovieEdit(e) {
    e.preventDefault();

    const id =
      Number(
        $('editMovieId')
          ?.value ||
        state.editingMovie
          ?.id
      );

    if (!id) {
      return;
    }

    const form =
      $('editMovieForm');

    const btn =
      form
        ?.querySelector(
          'button[type="submit"]'
        );

    const bar =
      $('editUploadBar');

    const textEl =
      $('editUploadText');

    busy(
      btn,
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

      const poster =
        $('editPosterFile')
          ?.files?.[0];

      const video =
        $('editVideoFile')
          ?.files?.[0];

      if (
        poster
      ) {
        body.poster_key =
          await uploadFile(
            'poster',
            poster,
            p => {
              progress(
                bar,
                textEl,
                p,
                `Poster ${p}%`
              );
            }
          );
      }

      if (
        video
      ) {
        body.video_key =
          await uploadFile(
            'video',
            video,
            p => {
              progress(
                bar,
                textEl,
                p,
                `Видео ${p}%`
              );
            }
          );
      }

      await api(
        `/api/admin/movies/${id}`,
        {
          method:
            'PUT',

          body
        }
      );

      progress(
        bar,
        textEl,
        100,
        '✓ Амжилттай хадгаллаа.'
      );

      await loadMovies();

      setTimeout(
        () => {
          closeModal(
            'editMovieModal'
          );
        },
        400
      );

    } catch (err) {
      progress(
        bar,
        textEl,
        0,
        `Алдаа: ${err.message}`
      );

    } finally {
      busy(
        btn,
        false
      );
    }
  }

  async function deleteMovie(id) {
    const m =
      state.movies.find(
        x =>
          Number(x.id) ===
          Number(id)
      );

    const name =
      m?.title ||
      `#${id}`;

    if (
      !confirm(
        `"${name}" киног бүр мөсөн устгах уу?`
      )
    ) {
      return;
    }

    try {
      await api(
        `/api/admin/movies/${id}`,
        {
          method:
            'DELETE'
        }
      );

      if (
        Number(
          state.editingMovie?.id
        ) === id
      ) {
        closeModal(
          'editMovieModal'
        );
      }

      await loadMovies();

      alert(
        'Кино устгагдлаа.'
      );

    } catch (err) {
      alert(
        err.message ||
        'Кино устгаж чадсангүй.'
      );
    }
  }

  async function loadAdminPurchases() {
    const box =
      $('adminPurchases');

    if (
      !box ||
      state.user?.role !==
        'admin'
    ) {
      return;
    }

    box.innerHTML =
      '<p class="muted">Уншиж байна...</p>';

    try {
      const data =
        await api(
          '/api/admin/purchases'
        );

      const list =
        Array.isArray(
          data.purchases
        )
          ? data.purchases
          : [];

      if (
        !list.length
      ) {
        box.innerHTML =
          '<p class="muted">Хүлээгдэж буй төлбөр алга байна.</p>';

        return;
      }

      box.innerHTML =
        list
          .map(
            p => `
              <div class="purchaseRow">

                <div class="purchaseInfo">

                  <b>
                    ${esc(
                      p.name ||
                      p.email ||
                      'Хэрэглэгч'
                    )}
                  </b>

                  <span>
                    ${esc(p.email || '')}
                  </span>

                  <span>
                    ${
                      p.type ===
                      'subscription'
                        ? '30 хоногийн эрх'
                        : esc(
                            p.movie_title ||
                            `Кино #${p.movie_id}`
                          )
                    }
                  </span>

                  <span>
                    ${money(p.amount)}
                    • Утга:
                    <strong>
                      ${esc(p.reference_code || '')}
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

      box
        .querySelectorAll(
          '.approvePurchase'
        )
        .forEach(
          btn => {
            btn.addEventListener(
              'click',
              () => {
                adminPurchaseAction(
                  Number(
                    btn.dataset.id
                  ),
                  'approve',
                  btn
                );
              }
            );
          }
        );

      box
        .querySelectorAll(
          '.rejectPurchase'
        )
        .forEach(
          btn => {
            btn.addEventListener(
              'click',
              () => {
                adminPurchaseAction(
                  Number(
                    btn.dataset.id
                  ),
                  'reject',
                  btn
                );
              }
            );
          }
        );

    } catch (err) {
      box.innerHTML =
        `<p class="error">${esc(err.message)}</p>`;
    }
  }

  async function adminPurchaseAction(
    id,
    action,
    btn
  ) {
    const label =
      action ===
      'approve'
        ? 'Батлах'
        : 'Татгалзах';

    if (
      !confirm(
        `${label} үйлдлийг хийх үү?`
      )
    ) {
      return;
    }

    busy(
      btn,
      true,
      '...'
    );

    try {
      await api(
        `/api/admin/purchases/${id}/${action}`,
        {
          method:
            'POST'
        }
      );

      await loadAdminPurchases();

      await loadMovies();

    } catch (err) {
      alert(
        err.message ||
        'Алдаа гарлаа.'
      );

      busy(
        btn,
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

    closeAllModals();

    renderAdminMovies();

    openModal(
      'adminModal'
    );

    await loadAdminPurchases();

    clearInterval(
      adminRefreshTimer
    );

    adminRefreshTimer =
      setInterval(
        () => {
          if (
            $('adminModal')
              ?.style
              .display ===
            'flex'
          ) {
            loadAdminPurchases()
              .catch(
                () => {}
              );
          }
        },
        5000
      );
  }

  function injectStyles() {
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

      @media (max-width:700px) {
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

    document.head.appendChild(
      style
    );
  }

  function bindEvents() {
    document
      .querySelectorAll(
        '.modal'
      )
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
              closeModal(
                el.closest(
                  '.modal'
                )
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
        btn => {
          btn.addEventListener(
            'click',
            () => {
              setAuthMode(
                btn.dataset.tab
              );
            }
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
          if (
            !state.user
          ) {
            closeAllModals();

            setAuthMode(
              'login'
            );

            openModal(
              'authModal'
            );

            return;
          }

          if (
            confirm(
              'Аккаунтаас гарах уу?'
            )
          ) {
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
        () => {
          startPurchase(
            'movie'
          );
        }
      );

    $('buySubBtn')
      ?.addEventListener(
        'click',
        () => {
          startPurchase(
            'subscription'
          );
        }
      );

    $('subBtn')
      ?.addEventListener(
        'click',
        () => {
          startPurchase(
            'subscription'
          );
        }
      );

    $('subBtn2')
      ?.addEventListener(
        'click',
        () => {
          startPurchase(
            'subscription'
          );
        }
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
            deleteMovie(
              id
            );
          }
        }
      );

    document
      .addEventListener(
        'keydown',
        e => {
          if (
            e.key !==
            'Escape'
          ) {
            return;
          }

          const open =
            [
              ...document.querySelectorAll(
                '.modal'
              )
            ]
              .reverse()
              .find(
                x =>
                  x.style.display ===
                  'flex'
              );

          if (
            open
          ) {
            closeModal(
              open
            );
          }
        }
      );
  }

  async function init() {
    injectStyles();

    bindEvents();

    setAuthMode(
      'login'
    );

    try {
      await refreshSession();
    } catch (err) {
      console.error(
        'Session load failed:',
        err
      );
    }

    try {
      await loadMovies();

    } catch (err) {
      console.error(
        'Movie load failed:',
        err
      );

      if (
        $('emptyState')
      ) {
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
