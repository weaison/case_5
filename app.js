/* ---------- Хранилище ---------- */

const KEY = 'travel_db';

const db = {
    users: [],
    trips: [],
    session: null
};

function loadDB() {
    try {
        const raw = localStorage.getItem(KEY);
        if (raw) Object.assign(db, JSON.parse(raw));
    } catch (e) {
        console.warn('Не удалось прочитать данные', e);
    }
}

function saveDB() {
    localStorage.setItem(KEY, JSON.stringify(db));
}

/* ---------- Утилиты ---------- */

function nextId(list) {
    return list.length ? Math.max(...list.map(x => x.id)) + 1 : 1;
}

function currentUser() {
    return db.session ? db.users.find(u => u.id === db.session.userId) : null;
}

function userByName(name) {
    return db.users.find(u => u.username === name);
}

function userById(id) {
    return db.users.find(u => u.id === id);
}

function tripById(id) {
    return db.trips.find(t => t.id === id);
}

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[c]);
}

function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h) + str.charCodeAt(i);
        h |= 0;
    }
    return 'h' + Math.abs(h).toString(36);
}

function fmtDate(iso) {
    return new Date(iso).toLocaleDateString('ru-RU');
}

function fmtDateFull(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU') + ' ' +
           d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function money(n) {
    return Number(n).toLocaleString('ru-RU') + ' ₽';
}

function flash(msg, type = 'ok') {
    const el = document.createElement('div');
    el.className = 'flash ' + type;
    el.textContent = msg;
    const main = document.getElementById('app');
    main.insertBefore(el, main.firstChild);
    setTimeout(() => el.remove(), 3200);
}

/* ---------- Начальные данные ---------- */

function seed() {
    if (db.users.length) return;

    db.users.push({
        id: 1,
        username: 'demo',
        email: 'demo@travel.local',
        password: hash('demo123')
    });

    db.trips.push({
        id: 1,
        authorId: 1,
        title: 'Выходные в Казани',
        description: 'Три дня в столице Татарстана: Кремль, Баумана, озеро Кабан.',
        location: 'Казань, Россия',
        lat: 55.796127,
        lng: 49.106414,
        startDate: '2025-05-01',
        endDate: '2025-05-03',
        cost: 18000,
        images: [
            'https://images.unsplash.com/photo-1569420426062-9c1c3e0e0d3f?w=600',
            'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=600'
        ],
        createdAt: new Date().toISOString()
    });

    saveDB();
}

/* ---------- Навигация ---------- */

function renderNav() {
    const nav = document.getElementById('nav');
    const user = currentUser();
    let html = `<a href="#/">Все путешествия</a>`;

    if (user) {
        html += `<a href="#/my">Мои путешествия</a>`;
        html += `<a href="#/new">Новая запись</a>`;
        html += `<a href="#/user/${esc(user.username)}">${esc(user.username)}</a>`;
        html += `<a href="#" id="logout">Выйти</a>`;
    } else {
        html += `<a href="#/login">Вход</a>`;
        html += `<a href="#/register">Регистрация</a>`;
    }

    nav.innerHTML = html;

    const out = document.getElementById('logout');
    if (out) out.onclick = e => {
        e.preventDefault();
        db.session = null;
        saveDB();
        location.hash = '#/';
        render();
    };
}

/* ---------- Роутер ---------- */

function render() {
    const hash = location.hash || '#/';
    const [path, queryStr] = hash.replace(/^#/, '').split('?');
    const parts = path.split('/').filter(Boolean);
    const app = document.getElementById('app');

    renderNav();
    app.innerHTML = '';

    const route = parts[0] || '';

    if (route === '')          return viewAll(app, new URLSearchParams(queryStr || ''));
    if (route === 'my')        return viewMyTrips(app);
    if (route === 'new')       return viewTripForm(app, null);
    if (route === 'trip' && parts[2] === 'edit') return viewTripForm(app, Number(parts[1]));
    if (route === 'trip')      return viewTrip(app, Number(parts[1]));
    if (route === 'user')      return viewProfile(app, parts[1]);
    if (route === 'login')     return viewLogin(app);
    if (route === 'register')  return viewRegister(app);

    app.innerHTML = '<p>Страница не найдена</p>';
}

/* ---------- Карточка путешествия ---------- */

function tripCard(t) {
    const author = userById(t.authorId);
    const cover = t.images && t.images.length
        ? `<img class="cover" src="${esc(t.images[0])}" alt=""
                onerror="this.style.display='none'">`
        : `<div class="cover"></div>`;

    const dates = t.startDate && t.endDate
        ? `${fmtDate(t.startDate)} — ${fmtDate(t.endDate)}`
        : 'Даты не указаны';

    return `
        <article class="trip">
            ${cover}
            <div class="content">
                <h3><a href="#/trip/${t.id}">${esc(t.title)}</a></h3>
                <p class="meta">
                    Автор: <a href="#/user/${esc(author.username)}">${esc(author.username)}</a>
                    · ${dates}
                </p>
                ${t.location
                    ? `<span class="place">📍 ${esc(t.location)}</span>`
                    : ''}
                ${t.cost
                    ? `<span class="cost">${money(t.cost)}</span>`
                    : ''}
                <p class="meta">${esc(t.description.slice(0, 120))}${t.description.length > 120 ? '…' : ''}</p>
            </div>
        </article>
    `;
}

/* ---------- Все путешествия ---------- */

function viewAll(app, params) {
    const search = (params.get('q') || '').toLowerCase();

    let list = [...db.trips];
    if (search) {
        list = list.filter(t =>
            t.title.toLowerCase().includes(search) ||
            t.location.toLowerCase().includes(search)
        );
    }
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    app.innerHTML = `
        <h1>Все путешествия</h1>

        <form class="filters" id="search-form">
            <label>Поиск по названию или месту
                <input type="text" name="q" value="${esc(search)}" placeholder="Например: Казань">
            </label>
        </form>

        ${list.length
            ? `<div class="grid">${list.map(tripCard).join('')}</div>`
            : '<p class="link-muted">Путешествий пока нет.</p>'}
    `;

    document.getElementById('search-form').addEventListener('input', e => {
        const q = e.target.value.trim();
        location.hash = q ? `#/?q=${encodeURIComponent(q)}` : '#/';
    });
}

/* ---------- Мои путешествия ---------- */

function viewMyTrips(app) {
    const user = currentUser();
    if (!user) { location.hash = '#/login'; return; }

    const list = db.trips
        .filter(t => t.authorId === user.id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    app.innerHTML = `
        <h1>Мои путешествия</h1>
        <p class="link-muted mt" style="margin-bottom:14px;">
            Всего записей: <strong>${list.length}</strong>
        </p>
        ${list.length
            ? `<div class="grid">${list.map(tripCard).join('')}</div>`
            : '<p class="link-muted">Пока нет записей. <a href="#/new">Добавить первую</a>.</p>'}
    `;
}

/* ---------- Страница путешествия ---------- */

function viewTrip(app, id) {
    const t = tripById(id);
    if (!t) { app.innerHTML = '<p>Запись не найдена.</p>'; return; }

    const author = userById(t.authorId);
    const me = currentUser();
    const isOwner = me && me.id === t.authorId;

    const dates = t.startDate && t.endDate
        ? `${fmtDate(t.startDate)} — ${fmtDate(t.endDate)}`
        : 'Даты не указаны';

    let mapBlock = '';
    if (t.lat && t.lng) {
        const bbox = [
            t.lng - 0.1, t.lat - 0.06,
            t.lng + 0.1, t.lat + 0.06
        ].join('%2C');

        mapBlock = `
            <div class="panel">
                <h2>Место на карте</h2>
                <p class="meta">Координаты: ${t.lat.toFixed(4)}, ${t.lng.toFixed(4)}</p>
                <iframe
                    src="https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${t.lat}%2C${t.lng}"
                    style="width:100%; height:320px; border:1px solid #e3e6ea; border-radius:8px; margin-top:10px;"
                    loading="lazy">
                </iframe>
                <p class="mt">
                    <a class="btn small gray"
                       href="https://www.openstreetmap.org/?mlat=${t.lat}&mlon=${t.lng}#map=13/${t.lat}/${t.lng}"
                       target="_blank" rel="noopener">
                        Открыть на карте
                    </a>
                </p>
            </div>
        `;
    }

    app.innerHTML = `
        <article class="panel">
            <h1>${esc(t.title)}</h1>
            <p class="meta">
                Автор: <a href="#/user/${esc(author.username)}">${esc(author.username)}</a>
                · создано ${fmtDateFull(t.createdAt)}
                ${t.updatedAt ? '· изменено ' + fmtDateFull(t.updatedAt) : ''}
            </p>

            <div class="two-col" style="margin-top:14px;">
                <div>
                    <p><strong>Даты поездки:</strong> ${dates}</p>
                    ${t.location ? `<p class="mt"><strong>Место:</strong> ${esc(t.location)}</p>` : ''}
                </div>
                <div>
                    ${t.cost ? `<p><strong>Стоимость:</strong> <span class="cost">${money(t.cost)}</span></p>` : ''}
                </div>
            </div>

            <p style="margin-top:14px; white-space:pre-wrap;">${esc(t.description)}</p>

            ${isOwner ? `
                <div class="actions">
                    <a class="btn" href="#/trip/${t.id}/edit">Редактировать</a>
                    <button class="danger" id="del-trip">Удалить</button>
                </div>
            ` : ''}
        </article>

        ${t.images && t.images.length ? `
            <div class="panel">
                <h2>Изображения</h2>
                <div class="gallery">
                    ${t.images.map((src, i) => `
                        <img src="${esc(src)}" alt="Изображение ${i + 1}"
                             onerror="this.style.opacity=0.3">
                    `).join('')}
                </div>
            </div>
        ` : ''}

        ${mapBlock}
    `;

    const delBtn = document.getElementById('del-trip');
    if (delBtn) delBtn.onclick = () => {
        if (!confirm('Удалить эту запись?')) return;
        db.trips = db.trips.filter(x => x.id !== t.id);
        saveDB();
        flash('Запись удалена', 'info');
        location.hash = '#/';
        render();
    };
}

/* ---------- Форма путешествия ---------- */

function viewTripForm(app, editId) {
    const me = currentUser();
    if (!me) { location.hash = '#/login'; return; }

    let editing = null;
    if (editId) {
        editing = tripById(editId);
        if (!editing || editing.authorId !== me.id) {
            app.innerHTML = '<div class="flash err">Нет доступа к этой записи.</div>';
            return;
        }
    }

    const images = editing ? [...editing.images] : [''];

    app.innerHTML = `
        <h1>${editing ? 'Редактировать путешествие' : 'Новое путешествие'}</h1>
        <div class="panel">
            <form id="trip-form">
                <label class="field">
                    <span>Название</span>
                    <input type="text" name="title" required maxlength="200"
                           value="${editing ? esc(editing.title) : ''}"
                           placeholder="Например: Выходные в Казани">
                </label>

                <label class="field">
                    <span>Описание</span>
                    <textarea name="description" rows="6" required
                              placeholder="Что интересного увидели, где были, что запомнилось">${editing ? esc(editing.description) : ''}</textarea>
                </label>

                <div class="two-col">
                    <label class="field">
                        <span>Дата начала</span>
                        <input type="date" name="startDate" value="${editing ? editing.startDate : ''}">
                    </label>
                    <label class="field">
                        <span>Дата окончания</span>
                        <input type="date" name="endDate" value="${editing ? editing.endDate : ''}">
                    </label>
                </div>

                <label class="field">
                    <span>Место (город, страна)</span>
                    <input type="text" name="location" value="${editing ? esc(editing.location) : ''}"
                           placeholder="Казань, Россия">
                </label>

                <div class="coord-row" style="margin-bottom:14px;">
                    <label class="field">
                        <span>Широта</span>
                        <input type="number" step="any" name="lat"
                               value="${editing && editing.lat ? editing.lat : ''}">
                    </label>
                    <label class="field">
                        <span>Долгота</span>
                        <input type="number" step="any" name="lng"
                               value="${editing && editing.lng ? editing.lng : ''}">
                    </label>
                    <button type="button" class="btn gray" id="geo-btn">Моё местоположение</button>
                </div>

                <label class="field">
                    <span>Стоимость путешествия, ₽</span>
                    <input type="number" min="0" step="1" name="cost"
                           value="${editing && editing.cost ? editing.cost : ''}">
                </label>

                <label class="field">
                    <span>Изображения (ссылки на фото)</span>
                </label>
                <div id="images-box">
                    ${images.map(src => `
                        <div class="image-row">
                            <input type="url" name="image" value="${esc(src)}"
                                   placeholder="https://...jpg">
                            <button type="button" class="gray remove-image">×</button>
                        </div>
                    `).join('')}
                </div>
                <button type="button" class="btn small gray" id="add-image">+ Добавить ещё</button>

                <div class="actions" style="margin-top:20px;">
                    <button type="submit">${editing ? 'Сохранить' : 'Опубликовать'}</button>
                    <a class="btn gray" href="#/">Отмена</a>
                </div>
            </form>
        </div>
    `;

    const imagesBox = document.getElementById('images-box');

    document.getElementById('add-image').onclick = () => {
        const row = document.createElement('div');
        row.className = 'image-row';
        row.innerHTML = `
            <input type="url" name="image" placeholder="https://...jpg">
            <button type="button" class="gray remove-image">×</button>
        `;
        imagesBox.appendChild(row);
    };

    imagesBox.addEventListener('click', e => {
        if (e.target.classList.contains('remove-image')) {
            const row = e.target.closest('.image-row');
            if (imagesBox.children.length > 1) row.remove();
            else row.querySelector('input').value = '';
        }
    });

    document.getElementById('geo-btn').onclick = () => {
        const f = document.getElementById('trip-form');
        if (!navigator.geolocation) {
            flash('Браузер не поддерживает геолокацию', 'err');
            return;
        }
        flash('Определяем координаты...', 'info');
        navigator.geolocation.getCurrentPosition(
            pos => {
                f.lat.value = pos.coords.latitude.toFixed(6);
                f.lng.value = pos.coords.longitude.toFixed(6);
                flash('Координаты получены');
            },
            () => flash('Не удалось получить координаты. Разрешите доступ.', 'err')
        );
    };

    document.getElementById('trip-form').onsubmit = e => {
        e.preventDefault();
        const f = e.target;

        const title = f.title.value.trim();
        const description = f.description.value.trim();
        const startDate = f.startDate.value;
        const endDate = f.endDate.value;
        const location = f.location.value.trim();
        const lat = f.lat.value ? parseFloat(f.lat.value) : null;
        const lng = f.lng.value ? parseFloat(f.lng.value) : null;
        const cost = f.cost.value ? Number(f.cost.value) : 0;

        const images = [...f.querySelectorAll('input[name="image"]')]
            .map(i => i.value.trim())
            .filter(Boolean);

        if (!title || !description) {
            flash('Заполните название и описание', 'err');
            return;
        }
        if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
            flash('Дата окончания не может быть раньше даты начала', 'err');
            return;
        }

        const data = {
            title, description, startDate, endDate,
            location, lat, lng, cost, images
        };

        if (editing) {
            Object.assign(editing, data);
            editing.updatedAt = new Date().toISOString();
            flash('Изменения сохранены');
        } else {
            db.trips.push({
                id: nextId(db.trips),
                authorId: me.id,
                ...data,
                createdAt: new Date().toISOString(),
                updatedAt: null
            });
            flash('Запись добавлена');
        }

        saveDB();
        location.hash = '#/my';
        render();
    };
}

/* ---------- Профиль ---------- */

function viewProfile(app, username) {
    const user = userByName(username);
    if (!user) { app.innerHTML = '<p>Пользователь не найден.</p>'; return; }

    const list = db.trips
        .filter(t => t.authorId === user.id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const totalCost = list.reduce((sum, t) => sum + (Number(t.cost) || 0), 0);

    app.innerHTML = `
        <h1>Профиль: ${esc(user.username)}</h1>

        <div class="panel">
            <p>Всего путешествий: <strong>${list.length}</strong></p>
            <p>Суммарная стоимость: <strong>${money(totalCost)}</strong></p>
        </div>

        <h2 style="margin-bottom:12px;">Путешествия</h2>
        ${list.length
            ? `<div class="grid">${list.map(tripCard).join('')}</div>`
            : '<p class="link-muted">Пока нет записей.</p>'}
    `;
}

/* ---------- Вход ---------- */

function viewLogin(app) {
    if (currentUser()) { location.hash = '#/'; return; }

    app.innerHTML = `
        <div class="panel center-form">
            <h1>Вход</h1>
            <form id="login-form">
                <label class="field">
                    <span>Логин или e-mail</span>
                    <input type="text" name="login" required autofocus>
                </label>
                <label class="field">
                    <span>Пароль</span>
                    <input type="password" name="password" required>
                </label>
                <button type="submit">Войти</button>
            </form>
            <p class="link-muted mt">Нет аккаунта? <a href="#/register">Зарегистрироваться</a></p>
            <p class="link-muted mt" style="font-size:12px; color:#999;">
                Демо-аккаунт: demo / demo123
            </p>
        </div>
    `;

    document.getElementById('login-form').onsubmit = e => {
        e.preventDefault();
        const f = e.target;
        const login = f.login.value.trim().toLowerCase();
        const pwd = f.password.value;

        const user = db.users.find(u =>
            u.username.toLowerCase() === login || u.email.toLowerCase() === login
        );

        if (!user || user.password !== hash(pwd)) {
            flash('Неверный логин или пароль', 'err');
            return;
        }

        db.session = { userId: user.id };
        saveDB();
        location.hash = '#/';
        render();
    };
}

/* ---------- Регистрация ---------- */

function viewRegister(app) {
    if (currentUser()) { location.hash = '#/'; return; }

    app.innerHTML = `
        <div class="panel center-form">
            <h1>Регистрация</h1>
            <form id="reg-form">
                <label class="field">
                    <span>Имя пользователя</span>
                    <input type="text" name="username" required minlength="3" maxlength="30">
                </label>
                <label class="field">
                    <span>E-mail</span>
                    <input type="email" name="email" required>
                </label>
                <label class="field">
                    <span>Пароль (мин. 6 символов)</span>
                    <input type="password" name="password" required minlength="6">
                </label>
                <button type="submit">Создать аккаунт</button>
            </form>
            <p class="link-muted mt">Уже есть аккаунт? <a href="#/login">Войти</a></p>
        </div>
    `;

    document.getElementById('reg-form').onsubmit = e => {
        e.preventDefault();
        const f = e.target;
        const username = f.username.value.trim();
        const email = f.email.value.trim().toLowerCase();
        const password = f.password.value;

        if (db.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
            flash('Такое имя уже занято', 'err');
            return;
        }
        if (db.users.some(u => u.email.toLowerCase() === email)) {
            flash('Такая почта уже зарегистрирована', 'err');
            return;
        }

        const user = { id: nextId(db.users), username, email, password: hash(password) };
        db.users.push(user);
        db.session = { userId: user.id };
        saveDB();

        location.hash = '#/';
        render();
    };
}

/* ---------- Старт ---------- */

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', () => {
    loadDB();
    seed();
    render();
});