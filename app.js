(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const elements = {
    csvInput: $('#csvInput'), fileDrop: $('#fileDrop'), fileName: $('#fileName'),
    summaryRow: $('#summaryRow'), classCount: $('#classCount'), studentCount: $('#studentCount'),
    warningCount: $('#warningCount'), cacheStatus: $('#cacheStatus'), clearCacheButton: $('#clearCacheButton'),
    workspace: $('#workspace'), mobileTabs: $('#mobileTabs'),
    classSelect: $('#classSelect'), studentSearch: $('#studentSearch'), studentList: $('#studentList'),
    progressText: $('#progressText'), progressBar: $('#progressBar'), selectedAvatar: $('#selectedAvatar'),
    selectedClass: $('#selectedClass'), selectedName: $('#selectedName'), selectedMeta: $('#selectedMeta'),
    saveState: $('#saveState'), absentButton: $('#absentButton'), cameraVideo: $('#cameraVideo'),
    photoPreview: $('#photoPreview'), cameraPlaceholder: $('#cameraPlaceholder'),
    placeholderTitle: $('#placeholderTitle'), placeholderText: $('#placeholderText'), studentCodeChip: $('#studentCodeChip'),
    cameraSelect: $('#cameraSelect'), openCameraButton: $('#openCameraButton'),
    nativeCameraLabel: $('#nativeCameraLabel'), nativeCameraInput: $('#nativeCameraInput'),
    captureButton: $('#captureButton'), retakeButton: $('#retakeButton'), saveButton: $('#saveButton'),
    saveNextButton: $('#saveNextButton'), chooseFolderButton: $('#chooseFolderButton'),
    storageTitle: $('#storageTitle'), storageHelp: $('#storageHelp'), iosNote: $('#iosNote'),
    captureProgressLabel: $('#captureProgressLabel'), captureProgressCount: $('#captureProgressCount'),
    captureProgressBar: $('#captureProgressBar'), nextStudentCard: $('#nextStudentCard'),
    nextStudentAvatar: $('#nextStudentAvatar'), nextStudentName: $('#nextStudentName'),
    nextStudentMeta: $('#nextStudentMeta'),
    captureCanvas: $('#captureCanvas'), toast: $('#toast'),
  };

  const state = {
    dataset: null,
    datasetFileName: '',
    selectedStudent: null,
    nextStudent: null,
    captured: new Set(),
    absent: new Set(),
    stream: null,
    photoBlob: null,
    photoUrl: null,
    directoryHandle: null,
    toastTimer: null,
    persistTimer: null,
    draftRevision: 0,
  };

  const SESSION_KEY = 'ltv-student-photo-session-v2';
  const DRAFT_DB_NAME = 'ltv-student-photo-drafts';

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isMobile = matchMedia('(max-width: 900px)').matches;

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    return (parts.length ? `${parts[0][0]}${parts.at(-1)[0]}` : 'HS').toUpperCase();
  }

  function safeFileName(value) {
    return String(value || 'hoc-sinh').trim().replace(/[\\/:*?"<>|]/g, '-');
  }

  function showToast(message, error = false) {
    clearTimeout(state.toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.toggle('is-error', error);
    elements.toast.classList.add('is-visible');
    state.toastTimer = setTimeout(() => elements.toast.classList.remove('is-visible'), 3200);
  }

  function nativeCacheAvailable() {
    return Boolean(window.AndroidPhotoSaver?.saveSession);
  }

  function sessionPayload() {
    if (!state.dataset) return null;
    return {
      version: 2,
      fileName: state.datasetFileName,
      savedAt: new Date().toISOString(),
      classNames: state.dataset.classNames,
      students: state.dataset.students,
      warnings: state.dataset.warnings,
      captured: [...state.captured],
      absent: [...state.absent],
      selectedClass: elements.classSelect.value,
      selectedStudentKey: state.selectedStudent?.key || '',
    };
  }

  function persistSessionNow() {
    const payload = sessionPayload();
    if (!payload) return;
    let saved = false;
    try {
      const serialized = JSON.stringify(payload);
      if (nativeCacheAvailable()) {
        window.AndroidPhotoSaver.saveSession(serialized);
        saved = true;
      }
      try {
        localStorage.setItem(SESSION_KEY, serialized);
        saved = true;
      } catch (storageError) {
        // Native Android cache remains the primary durable store in the app.
      }
      elements.cacheStatus.textContent = saved ? 'Đã lưu tiến độ' : 'Lỗi lưu tiến độ';
      if (!saved) showToast('Không lưu được tiến độ làm việc.', true);
    } catch (error) {
      elements.cacheStatus.textContent = 'Lỗi lưu tiến độ';
      showToast('Không lưu được tiến độ làm việc.', true);
    }
  }

  function schedulePersist() {
    if (!state.dataset) return;
    elements.cacheStatus.textContent = 'Đang lưu…';
    clearTimeout(state.persistTimer);
    state.persistTimer = setTimeout(persistSessionNow, 180);
  }

  function readCachedSession() {
    try {
      const nativeValue = nativeCacheAvailable() ? window.AndroidPhotoSaver.loadSession() : '';
      let browserValue = '';
      try { browserValue = localStorage.getItem(SESSION_KEY); } catch (storageError) { /* no-op */ }
      const raw = nativeValue || browserValue;
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function rebuildDataset(cache) {
    if (!cache || cache.version !== 2 || !Array.isArray(cache.students) || !Array.isArray(cache.classNames)) return null;
    const groups = new Map(cache.classNames.map((className) => [className, []]));
    for (const student of cache.students) {
      if (!groups.has(student.className)) groups.set(student.className, []);
      groups.get(student.className).push(student);
    }
    return {
      groups,
      classNames: cache.classNames,
      students: cache.students,
      warnings: Array.isArray(cache.warnings) ? cache.warnings : [],
    };
  }

  function openDraftDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DRAFT_DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('drafts');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function cacheDraftStore(blob, studentKey) {
    const revision = ++state.draftRevision;
    try {
      if (window.AndroidPhotoSaver?.cacheDraft) {
        const dataUrl = await blobToDataUrl(blob);
        if (revision !== state.draftRevision || state.selectedStudent?.key !== studentKey) return;
        window.AndroidPhotoSaver.cacheDraft(dataUrl, studentKey);
        return;
      }
      const database = await openDraftDatabase();
      const transaction = database.transaction('drafts', 'readwrite');
      transaction.objectStore('drafts').put({ blob, studentKey, savedAt: Date.now() }, 'current');
    } catch (error) {
      showToast('Không lưu được ảnh nháp.', true);
    }
  }

  async function loadDraftStore() {
    try {
      if (window.AndroidPhotoSaver?.loadDraft) {
        const raw = window.AndroidPhotoSaver.loadDraft();
        if (!raw) return null;
        const draft = JSON.parse(raw);
        return { studentKey: draft.studentKey, blob: dataUrlToBlob(draft.dataUrl) };
      }
      const database = await openDraftDatabase();
      return await new Promise((resolve, reject) => {
        const request = database.transaction('drafts', 'readonly').objectStore('drafts').get('current');
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      return null;
    }
  }

  async function clearDraftStore() {
    state.draftRevision += 1;
    try {
      if (window.AndroidPhotoSaver?.clearDraft) {
        window.AndroidPhotoSaver.clearDraft();
        return;
      }
      const database = await openDraftDatabase();
      database.transaction('drafts', 'readwrite').objectStore('drafts').delete('current');
    } catch (error) {
      // Draft cleanup should never interrupt the capture workflow.
    }
  }

  function setMobileView(view) {
    elements.workspace.dataset.mobileView = view;
    document.querySelectorAll('.mobile-tab').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.view === view);
    });
  }

  function releasePhotoUrl() {
    if (state.photoUrl) URL.revokeObjectURL(state.photoUrl);
    state.photoUrl = null;
  }

  function clearPhotoPreview({ keepDraft = false } = {}) {
    releasePhotoUrl();
    state.photoBlob = null;
    elements.photoPreview.src = '';
    elements.photoPreview.hidden = true;
    elements.retakeButton.hidden = true;
    elements.saveButton.hidden = true;
    elements.saveNextButton.hidden = true;
    if (!keepDraft) clearDraftStore();
    updateCameraStage();
  }

  function updateCameraStage() {
    const isAbsent = Boolean(state.selectedStudent && state.absent.has(state.selectedStudent.key));
    const hasVideo = Boolean(state.stream) && !state.photoBlob && !isAbsent;
    const hasPhoto = Boolean(state.photoBlob) && !isAbsent;
    elements.cameraVideo.hidden = !hasVideo;
    elements.photoPreview.hidden = !hasPhoto;
    elements.cameraPlaceholder.hidden = hasVideo || hasPhoto;
    elements.captureButton.disabled = !hasVideo || !state.selectedStudent || isAbsent;
    elements.studentCodeChip.hidden = !state.selectedStudent || (!hasVideo && !hasPhoto);
    if (state.selectedStudent) elements.studentCodeChip.textContent = `${state.selectedStudent.code}.jpg`;
    if (isAbsent) {
      elements.placeholderTitle.textContent = 'Học sinh được đánh dấu vắng';
      elements.placeholderText.textContent = 'Bỏ đánh dấu vắng nếu học sinh có mặt và cần chụp ảnh.';
    } else {
      elements.placeholderTitle.textContent = 'Sẵn sàng chụp ảnh';
      elements.placeholderText.textContent = 'Mở camera trực tiếp hoặc dùng camera của điện thoại.';
    }
  }

  function updateSelectedStudent() {
    const student = state.selectedStudent;
    const isAbsent = Boolean(student && state.absent.has(student.key));
    const enabled = Boolean(student) && !isAbsent;
    elements.openCameraButton.disabled = !enabled;
    elements.nativeCameraInput.disabled = !enabled;
    elements.nativeCameraLabel.setAttribute('aria-disabled', String(!enabled));
    elements.absentButton.disabled = !student;
    elements.absentButton.classList.toggle('is-absent', isAbsent);
    elements.absentButton.textContent = isAbsent ? 'Vắng · Bỏ đánh dấu' : 'Đánh dấu vắng';

    if (!student) {
      elements.selectedAvatar.textContent = 'HS';
      elements.selectedClass.textContent = 'Chưa chọn lớp';
      elements.selectedName.textContent = 'Chọn một học sinh';
      elements.selectedMeta.textContent = 'Mã học sinh sẽ hiển thị tại đây';
      elements.saveState.hidden = true;
    } else {
      elements.selectedAvatar.textContent = initials(student.name);
      elements.selectedClass.textContent = `Lớp ${student.className}`;
      elements.selectedName.textContent = student.name;
      elements.selectedMeta.textContent = `Mã: ${student.code}${student.birthDate ? ` · Sinh: ${student.birthDate}` : ''}`;
      elements.saveState.hidden = !state.captured.has(student.key);
    }
    updateCameraStage();
  }

  function currentClassStudents() {
    if (!state.dataset) return [];
    return state.dataset.groups.get(elements.classSelect.value) || [];
  }

  function updateProgress() {
    const students = currentClassStudents();
    const captured = students.filter((student) => state.captured.has(student.key) && !state.absent.has(student.key)).length;
    const absent = students.filter((student) => state.absent.has(student.key)).length;
    const handled = students.filter((student) => state.captured.has(student.key) || state.absent.has(student.key)).length;
    elements.progressText.textContent = `${captured} đã chụp · ${absent} vắng`;
    elements.progressBar.style.width = students.length ? `${(handled / students.length) * 100}%` : '0%';
    elements.captureProgressLabel.textContent = elements.classSelect.value ? `Tiến độ lớp ${elements.classSelect.value}` : 'Tiến độ lớp';
    elements.captureProgressCount.textContent = `${handled}/${students.length}`;
    elements.captureProgressBar.style.width = students.length ? `${(handled / students.length) * 100}%` : '0%';
    updateNextStudentPreview(students, handled);
  }

  function nextPendingStudent(students = currentClassStudents()) {
    if (!students.length) return null;
    const needsHandling = (student) => !state.captured.has(student.key) && !state.absent.has(student.key);
    const currentIndex = state.selectedStudent
      ? students.findIndex((student) => student.key === state.selectedStudent.key)
      : -1;
    if (currentIndex < 0) return students.find(needsHandling) || null;
    return students.slice(currentIndex + 1).find(needsHandling)
      || students.slice(0, currentIndex).find(needsHandling)
      || null;
  }

  function updateNextStudentPreview(students, handled) {
    const next = nextPendingStudent(students);
    state.nextStudent = next;
    elements.nextStudentCard.disabled = !next;
    if (next) {
      elements.nextStudentAvatar.textContent = initials(next.name);
      elements.nextStudentName.textContent = next.name;
      elements.nextStudentMeta.textContent = `Mã ${next.code} · Lớp ${next.className}${next.birthDate ? ` · ${next.birthDate}` : ''}`;
      return;
    }
    elements.nextStudentAvatar.textContent = handled === students.length && students.length ? '✓' : 'HS';
    elements.nextStudentName.textContent = handled === students.length && students.length
      ? 'Đã xử lý xong lớp'
      : (state.selectedStudent ? 'Bạn hiện tại là người cuối' : 'Chưa có dữ liệu');
    elements.nextStudentMeta.textContent = handled === students.length && students.length
      ? `${handled}/${students.length} học sinh đã được xử lý`
      : 'Không còn học sinh tiếp theo chưa xử lý';
  }

  function renderStudentList() {
    const query = elements.studentSearch.value.trim().toLocaleLowerCase('vi');
    const students = currentClassStudents().filter((student) => (
      !query || student.name.toLocaleLowerCase('vi').includes(query) || student.code.toLowerCase().includes(query)
    ));
    elements.studentList.replaceChildren();

    if (!students.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-list';
      empty.textContent = 'Không tìm thấy học sinh.';
      elements.studentList.append(empty);
      updateProgress();
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const student of students) {
      const item = document.createElement('div');
      item.className = 'student-item';
      item.role = 'option';
      item.tabIndex = 0;
      item.dataset.key = student.key;
      item.classList.toggle('is-active', state.selectedStudent?.key === student.key);
      item.classList.toggle('is-absent', state.absent.has(student.key));
      item.setAttribute('aria-selected', String(state.selectedStudent?.key === student.key));

      const avatar = document.createElement('span');
      avatar.className = 'student-avatar';
      avatar.textContent = initials(student.name);
      const details = document.createElement('span');
      details.className = 'student-details';
      const name = document.createElement('strong');
      name.textContent = student.name;
      const meta = document.createElement('small');
      meta.textContent = `${student.code}${student.birthDate ? ` · ${student.birthDate}` : ''}`;
      details.append(name, meta);
      const actions = document.createElement('span');
      actions.className = 'student-actions';
      if (state.captured.has(student.key)) {
        const check = document.createElement('span');
        check.className = 'captured-check';
        check.textContent = '✓';
        check.title = 'Đã lưu ảnh';
        actions.append(check);
      }
      const absentToggle = document.createElement('span');
      absentToggle.className = 'absent-toggle';
      absentToggle.classList.toggle('is-active', state.absent.has(student.key));
      absentToggle.role = 'button';
      absentToggle.tabIndex = 0;
      absentToggle.textContent = state.absent.has(student.key) ? 'Vắng' : 'Có mặt';
      absentToggle.title = state.absent.has(student.key) ? 'Bỏ đánh dấu vắng' : 'Đánh dấu vắng';
      const toggleFromList = (event) => {
        event.stopPropagation();
        toggleAbsent(student);
      };
      absentToggle.addEventListener('click', toggleFromList);
      absentToggle.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') toggleFromList(event);
      });
      actions.append(absentToggle);
      item.append(avatar, details, actions);
      item.addEventListener('click', () => selectStudent(student));
      item.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') selectStudent(student);
      });
      fragment.append(item);
    }
    elements.studentList.append(fragment);
    updateProgress();
  }

  function selectStudent(student, force = false) {
    if (state.selectedStudent?.key === student.key) {
      if (isMobile) setMobileView('camera');
      return;
    }
    if (!force && state.photoBlob && state.selectedStudent?.key !== student.key) {
      const discard = window.confirm('Ảnh vừa chụp chưa được lưu. Bạn có muốn bỏ ảnh và chọn học sinh khác?');
      if (!discard) return;
    }
    clearPhotoPreview();
    state.selectedStudent = student;
    updateSelectedStudent();
    renderStudentList();
    schedulePersist();
    if (isMobile) setMobileView('camera');
  }

  function toggleAbsent(student = state.selectedStudent) {
    if (!student) return;
    const markingAbsent = !state.absent.has(student.key);
    if (markingAbsent && state.photoBlob && state.selectedStudent?.key === student.key) {
      const discard = window.confirm('Ảnh vừa chụp chưa được lưu. Đánh dấu vắng sẽ bỏ ảnh nháp này. Tiếp tục?');
      if (!discard) return;
    }
    if (markingAbsent) {
      state.absent.add(student.key);
      if (state.selectedStudent?.key === student.key) {
        stopCamera();
        clearPhotoPreview();
      }
      showToast(`Đã đánh dấu vắng: ${student.name}`);
    } else {
      state.absent.delete(student.key);
      showToast(`Đã bỏ đánh dấu vắng: ${student.name}`);
    }
    if (state.selectedStudent?.key === student.key) updateSelectedStudent();
    renderStudentList();
    schedulePersist();
  }

  function populateClasses() {
    elements.classSelect.replaceChildren();
    for (const className of state.dataset.classNames) {
      const option = document.createElement('option');
      option.value = className;
      option.textContent = `Lớp ${className} · ${state.dataset.groups.get(className).length} học sinh`;
      elements.classSelect.append(option);
    }
  }

  function revealDataset(fileLabel) {
    elements.fileName.textContent = fileLabel;
    elements.classCount.textContent = state.dataset.classNames.length;
    elements.studentCount.textContent = state.dataset.students.length;
    elements.warningCount.textContent = state.dataset.warnings.length;
    elements.summaryRow.hidden = false;
    elements.workspace.hidden = false;
    elements.mobileTabs.hidden = false;
  }

  async function loadCsv(file) {
    if (!file) return;
    try {
      elements.fileName.textContent = 'Đang đọc dữ liệu…';
      const text = await file.text();
      state.dataset = window.StudentCsv.parseStudentCsv(text);
      state.datasetFileName = file.name;
      state.captured.clear();
      state.absent.clear();
      state.selectedStudent = null;
      clearPhotoPreview();
      populateClasses();
      elements.studentSearch.value = '';
      revealDataset(file.name);
      renderStudentList();
      const first = currentClassStudents()[0];
      if (first) selectStudent(first, true);
      if (isMobile) setMobileView('list');
      persistSessionNow();
      showToast(`Đã nhập ${state.dataset.students.length} học sinh thuộc ${state.dataset.classNames.length} lớp.`);
    } catch (error) {
      elements.fileName.textContent = 'Chọn lại file CSV';
      showToast(error.message || 'Không thể đọc file CSV.', true);
    }
  }

  async function restoreCachedSession() {
    const cache = readCachedSession();
    const dataset = rebuildDataset(cache);
    if (!dataset) return;

    const draft = await loadDraftStore();
    state.dataset = dataset;
    state.datasetFileName = cache.fileName || 'Danh sách đã lưu';
    const validKeys = new Set(dataset.students.map((student) => student.key));
    state.captured = new Set((cache.captured || []).filter((key) => validKeys.has(key)));
    state.absent = new Set((cache.absent || []).filter((key) => validKeys.has(key)));
    populateClasses();
    if (dataset.groups.has(cache.selectedClass)) elements.classSelect.value = cache.selectedClass;
    elements.studentSearch.value = '';
    revealDataset(`${state.datasetFileName} · đã khôi phục`);

    const classStudents = currentClassStudents();
    state.selectedStudent = classStudents.find((student) => student.key === cache.selectedStudentKey) || classStudents[0] || null;
    updateSelectedStudent();
    renderStudentList();

    if (draft?.blob && draft.studentKey === state.selectedStudent?.key
        && !state.captured.has(draft.studentKey) && !state.absent.has(draft.studentKey)) {
      await showCapturedBlob(draft.blob, false);
      if (isMobile) setMobileView('camera');
      showToast('Đã khôi phục danh sách, tiến độ và ảnh nháp chưa lưu.');
    } else {
      clearDraftStore();
      if (isMobile) setMobileView('list');
      showToast('Đã khôi phục danh sách và tiến độ lần trước.');
    }
    elements.cacheStatus.textContent = 'Đã khôi phục tiến độ';
  }

  async function clearCachedSession() {
    const confirmed = window.confirm('Xóa danh sách, trạng thái đã chụp, trạng thái vắng và ảnh nháp đang lưu trên thiết bị? Ảnh đã lưu trong Pictures sẽ không bị xóa.');
    if (!confirmed) return;
    stopCamera();
    clearTimeout(state.persistTimer);
    try { localStorage.removeItem(SESSION_KEY); } catch (storageError) { /* no-op */ }
    if (window.AndroidPhotoSaver?.clearSession) window.AndroidPhotoSaver.clearSession();
    await clearDraftStore();
    state.dataset = null;
    state.datasetFileName = '';
    state.selectedStudent = null;
    state.captured.clear();
    state.absent.clear();
    clearPhotoPreview();
    elements.csvInput.value = '';
    elements.fileName.textContent = 'hoặc kéo thả file vào đây';
    elements.summaryRow.hidden = true;
    elements.workspace.hidden = true;
    elements.mobileTabs.hidden = true;
    showToast('Đã xóa dữ liệu nhớ. Ảnh đã lưu vẫn được giữ nguyên.');
  }

  async function refreshCameraDevices(selectedId) {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'videoinput');
    elements.cameraSelect.replaceChildren();
    devices.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `Camera ${index + 1}`;
      option.selected = device.deviceId === selectedId;
      elements.cameraSelect.append(option);
    });
    elements.cameraSelect.hidden = devices.length < 2;
  }

  function stopCamera() {
    if (state.stream) state.stream.getTracks().forEach((track) => track.stop());
    state.stream = null;
    elements.cameraVideo.srcObject = null;
    updateCameraStage();
  }

  async function openCamera(deviceId = '') {
    if (!state.selectedStudent) return;
    if (state.absent.has(state.selectedStudent.key)) {
      showToast('Học sinh đang được đánh dấu vắng.', true);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      showToast('Trình duyệt không hỗ trợ camera trực tiếp. Hãy dùng nút Camera điện thoại.', true);
      return;
    }
    if (!window.isSecureContext) {
      showToast('Camera trực tiếp cần HTTPS. Trên điện thoại, hãy dùng nút Camera điện thoại.', true);
      return;
    }

    try {
      stopCamera();
      clearPhotoPreview();
      const video = deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } };
      state.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      elements.cameraVideo.srcObject = state.stream;
      await elements.cameraVideo.play();
      const activeId = state.stream.getVideoTracks()[0]?.getSettings().deviceId;
      await refreshCameraDevices(activeId);
      updateCameraStage();
    } catch (error) {
      stopCamera();
      showToast('Không mở được camera. Hãy kiểm tra quyền camera của trình duyệt.', true);
    }
  }

  function canvasToBlob(canvas, quality = 0.92) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Không tạo được ảnh.')), 'image/jpeg', quality);
    });
  }

  async function showCapturedBlob(blob, persistDraft = true) {
    releasePhotoUrl();
    state.photoBlob = blob;
    state.photoUrl = URL.createObjectURL(blob);
    elements.photoPreview.src = state.photoUrl;
    elements.photoPreview.hidden = false;
    elements.cameraVideo.hidden = true;
    elements.cameraPlaceholder.hidden = true;
    elements.captureButton.disabled = true;
    elements.retakeButton.hidden = false;
    elements.saveButton.hidden = false;
    elements.saveNextButton.hidden = false;
    updateCameraStage();
    if (persistDraft && state.selectedStudent) await cacheDraftStore(blob, state.selectedStudent.key);
  }

  async function captureVideoFrame() {
    const video = elements.cameraVideo;
    if (!state.stream || !video.videoWidth) return;
    const canvas = elements.captureCanvas;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    await showCapturedBlob(await canvasToBlob(canvas));
  }

  async function normalizeMobilePhoto(file) {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const maxSide = 2400;
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = elements.captureCanvas;
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      return await canvasToBlob(canvas, 0.92);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function onNativePhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !state.selectedStudent || state.absent.has(state.selectedStudent.key)) return;
    try {
      stopCamera();
      await showCapturedBlob(await normalizeMobilePhoto(file));
    } catch (error) {
      showToast('Không xử lý được ảnh vừa chọn.', true);
    }
  }

  function triggerDownload(file) {
    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Không đọc được dữ liệu ảnh.'));
      reader.readAsDataURL(blob);
    });
  }

  function dataUrlToBlob(dataUrl) {
    const [metadata, payload] = String(dataUrl || '').split(',', 2);
    if (!metadata || !payload) throw new Error('Ảnh nháp không hợp lệ.');
    const mime = /data:([^;]+)/.exec(metadata)?.[1] || 'image/jpeg';
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: mime });
  }

  async function chooseDirectory() {
    try {
      state.directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      elements.storageTitle.textContent = `Thư mục: ${state.directoryHandle.name}`;
      elements.storageHelp.textContent = 'Ảnh sẽ được ghi trực tiếp vào thư mục này.';
      showToast('Đã chọn thư mục lưu ảnh.');
    } catch (error) {
      if (error.name !== 'AbortError') showToast('Không thể mở thư mục lưu ảnh.', true);
    }
  }

  async function savePhoto(goNext) {
    if (!state.photoBlob || !state.selectedStudent || state.absent.has(state.selectedStudent.key)) return;
    const student = state.selectedStudent;
    const filename = `${safeFileName(student.code)}.jpg`;
    const file = new File([state.photoBlob], filename, { type: 'image/jpeg', lastModified: Date.now() });

    try {
      if (window.AndroidPhotoSaver?.saveImage) {
        const saved = window.AndroidPhotoSaver.saveImage(await blobToDataUrl(file), filename);
        if (!saved) throw new Error('Android không lưu được ảnh.');
      } else if (state.directoryHandle) {
        const fileHandle = await state.directoryHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(file);
        await writable.close();
      } else if (isIOS && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
      } else {
        triggerDownload(file);
      }
    } catch (error) {
      if (error.name === 'AbortError') return;
      showToast('Không lưu được ảnh. Vui lòng thử lại.', true);
      return;
    }

    state.captured.add(student.key);
    clearDraftStore();
    elements.saveState.hidden = false;
    renderStudentList();
    persistSessionNow();
    showToast(`Đã lưu ${filename}`);
    if (goNext) selectNextStudent();
  }

  function selectNextStudent() {
    const students = currentClassStudents();
    if (!students.length || !state.selectedStudent) return;
    const next = nextPendingStudent(students);
    if (next) {
      clearPhotoPreview();
      selectStudent(next, true);
      if (state.stream) updateCameraStage();
    } else {
      clearPhotoPreview();
      showToast(`Đã xử lý xong lớp ${elements.classSelect.value}.`);
    }
  }

  function retakePhoto() {
    clearPhotoPreview();
    if (!state.stream && isMobile) elements.nativeCameraInput.click();
  }

  function configurePlatform() {
    const hasDirectoryPicker = 'showDirectoryPicker' in window;
    const isAndroidApp = Boolean(window.AndroidPhotoSaver?.saveImage);
    elements.chooseFolderButton.hidden = !hasDirectoryPicker || isAndroidApp;
    elements.iosNote.hidden = !isIOS;
    if (isAndroidApp) {
      elements.storageTitle.textContent = 'Thư mục Pictures/LTV_Hoc_Sinh';
      elements.storageHelp.textContent = 'App lưu trực tiếp và đặt tên ảnh theo mã học sinh.';
    } else if (isIOS) {
      elements.saveButton.textContent = 'Chia sẻ / Lưu ảnh';
      elements.saveNextButton.textContent = 'Lưu & học sinh tiếp';
      elements.storageTitle.textContent = 'Lưu ảnh trên iPhone/iPad';
      elements.storageHelp.textContent = 'Ảnh sẽ mở bảng Chia sẻ với tên mã học sinh.';
    } else if (hasDirectoryPicker) {
      elements.storageTitle.textContent = 'Chưa chọn thư mục lưu';
      elements.storageHelp.textContent = 'Chọn thư mục để lưu ảnh tự động, đúng tên mã học sinh.';
    } else {
      elements.storageTitle.textContent = 'Lưu vào thư mục Tải xuống';
      elements.storageHelp.textContent = 'Mỗi ảnh sẽ được tải xuống với tên mã học sinh.';
    }

    if (!navigator.mediaDevices?.getUserMedia || (!window.isSecureContext && location.hostname !== 'localhost')) {
      elements.openCameraButton.title = 'Camera trực tiếp cần trang HTTPS';
    }
  }

  elements.csvInput.addEventListener('change', (event) => loadCsv(event.target.files?.[0]));
  elements.fileDrop.addEventListener('dragover', (event) => { event.preventDefault(); elements.fileDrop.classList.add('is-dragging'); });
  elements.fileDrop.addEventListener('dragleave', () => elements.fileDrop.classList.remove('is-dragging'));
  elements.fileDrop.addEventListener('drop', (event) => {
    event.preventDefault();
    elements.fileDrop.classList.remove('is-dragging');
    loadCsv(event.dataTransfer.files?.[0]);
  });
  elements.classSelect.addEventListener('change', () => {
    clearPhotoPreview();
    elements.studentSearch.value = '';
    const first = currentClassStudents()[0];
    state.selectedStudent = null;
    renderStudentList();
    if (first) selectStudent(first, true);
    if (isMobile) setMobileView('list');
    schedulePersist();
  });
  elements.studentSearch.addEventListener('input', renderStudentList);
  elements.openCameraButton.addEventListener('click', () => openCamera(elements.cameraSelect.value));
  elements.cameraSelect.addEventListener('change', () => openCamera(elements.cameraSelect.value));
  elements.nativeCameraInput.addEventListener('change', onNativePhoto);
  elements.captureButton.addEventListener('click', captureVideoFrame);
  elements.retakeButton.addEventListener('click', retakePhoto);
  elements.saveButton.addEventListener('click', () => savePhoto(false));
  elements.saveNextButton.addEventListener('click', () => savePhoto(true));
  elements.absentButton.addEventListener('click', () => toggleAbsent());
  elements.nextStudentCard.addEventListener('click', () => {
    if (state.nextStudent) selectStudent(state.nextStudent);
  });
  elements.chooseFolderButton.addEventListener('click', chooseDirectory);
  elements.clearCacheButton.addEventListener('click', clearCachedSession);
  document.querySelectorAll('.mobile-tab').forEach((button) => button.addEventListener('click', () => setMobileView(button.dataset.view)));
  window.addEventListener('beforeunload', () => {
    persistSessionNow();
    stopCamera();
  });

  configurePlatform();
  restoreCachedSession().catch(() => showToast('Không khôi phục được dữ liệu nhớ.', true));
  if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
