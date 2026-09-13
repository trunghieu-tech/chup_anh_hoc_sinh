(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const elements = {
    csvInput: $('#csvInput'), fileDrop: $('#fileDrop'), fileName: $('#fileName'),
    summaryRow: $('#summaryRow'), classCount: $('#classCount'), studentCount: $('#studentCount'),
    warningCount: $('#warningCount'), workspace: $('#workspace'), mobileTabs: $('#mobileTabs'),
    classSelect: $('#classSelect'), studentSearch: $('#studentSearch'), studentList: $('#studentList'),
    progressText: $('#progressText'), progressBar: $('#progressBar'), selectedAvatar: $('#selectedAvatar'),
    selectedClass: $('#selectedClass'), selectedName: $('#selectedName'), selectedMeta: $('#selectedMeta'),
    saveState: $('#saveState'), cameraVideo: $('#cameraVideo'), photoPreview: $('#photoPreview'),
    cameraPlaceholder: $('#cameraPlaceholder'), studentCodeChip: $('#studentCodeChip'),
    cameraSelect: $('#cameraSelect'), openCameraButton: $('#openCameraButton'),
    nativeCameraLabel: $('#nativeCameraLabel'), nativeCameraInput: $('#nativeCameraInput'),
    captureButton: $('#captureButton'), retakeButton: $('#retakeButton'), saveButton: $('#saveButton'),
    saveNextButton: $('#saveNextButton'), chooseFolderButton: $('#chooseFolderButton'),
    storageTitle: $('#storageTitle'), storageHelp: $('#storageHelp'), iosNote: $('#iosNote'),
    captureCanvas: $('#captureCanvas'), toast: $('#toast'),
  };

  const state = {
    dataset: null,
    selectedStudent: null,
    captured: new Set(),
    stream: null,
    photoBlob: null,
    photoUrl: null,
    directoryHandle: null,
    toastTimer: null,
  };

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

  function clearPhotoPreview() {
    releasePhotoUrl();
    state.photoBlob = null;
    elements.photoPreview.src = '';
    elements.photoPreview.hidden = true;
    elements.retakeButton.hidden = true;
    elements.saveButton.hidden = true;
    elements.saveNextButton.hidden = true;
    updateCameraStage();
  }

  function updateCameraStage() {
    const hasVideo = Boolean(state.stream) && !state.photoBlob;
    const hasPhoto = Boolean(state.photoBlob);
    elements.cameraVideo.hidden = !hasVideo;
    elements.photoPreview.hidden = !hasPhoto;
    elements.cameraPlaceholder.hidden = hasVideo || hasPhoto;
    elements.captureButton.disabled = !hasVideo || !state.selectedStudent;
    elements.studentCodeChip.hidden = !state.selectedStudent || (!hasVideo && !hasPhoto);
    if (state.selectedStudent) elements.studentCodeChip.textContent = `${state.selectedStudent.code}.jpg`;
  }

  function updateSelectedStudent() {
    const student = state.selectedStudent;
    const enabled = Boolean(student);
    elements.openCameraButton.disabled = !enabled;
    elements.nativeCameraInput.disabled = !enabled;
    elements.nativeCameraLabel.setAttribute('aria-disabled', String(!enabled));

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
    const done = students.filter((student) => state.captured.has(student.key)).length;
    elements.progressText.textContent = `${done}/${students.length} đã chụp`;
    elements.progressBar.style.width = students.length ? `${(done / students.length) * 100}%` : '0%';
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
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'student-item';
      button.role = 'option';
      button.dataset.key = student.key;
      button.classList.toggle('is-active', state.selectedStudent?.key === student.key);
      button.setAttribute('aria-selected', String(state.selectedStudent?.key === student.key));

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
      button.append(avatar, details);
      if (state.captured.has(student.key)) {
        const check = document.createElement('span');
        check.className = 'captured-check';
        check.textContent = '✓';
        check.title = 'Đã lưu ảnh';
        button.append(check);
      }
      button.addEventListener('click', () => selectStudent(student));
      fragment.append(button);
    }
    elements.studentList.append(fragment);
    updateProgress();
  }

  function selectStudent(student, force = false) {
    if (!force && state.photoBlob && state.selectedStudent?.key !== student.key) {
      const discard = window.confirm('Ảnh vừa chụp chưa được lưu. Bạn có muốn bỏ ảnh và chọn học sinh khác?');
      if (!discard) return;
    }
    clearPhotoPreview();
    state.selectedStudent = student;
    updateSelectedStudent();
    renderStudentList();
    if (isMobile) setMobileView('camera');
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

  async function loadCsv(file) {
    if (!file) return;
    try {
      elements.fileName.textContent = 'Đang đọc dữ liệu…';
      const text = await file.text();
      state.dataset = window.StudentCsv.parseStudentCsv(text);
      state.captured.clear();
      state.selectedStudent = null;
      clearPhotoPreview();
      populateClasses();
      elements.studentSearch.value = '';
      elements.fileName.textContent = file.name;
      elements.classCount.textContent = state.dataset.classNames.length;
      elements.studentCount.textContent = state.dataset.students.length;
      elements.warningCount.textContent = state.dataset.warnings.length;
      elements.summaryRow.hidden = false;
      elements.workspace.hidden = false;
      elements.mobileTabs.hidden = false;
      renderStudentList();
      const first = currentClassStudents()[0];
      if (first) selectStudent(first, true);
      if (isMobile) setMobileView('list');
      showToast(`Đã nhập ${state.dataset.students.length} học sinh thuộc ${state.dataset.classNames.length} lớp.`);
    } catch (error) {
      elements.fileName.textContent = 'Chọn lại file CSV';
      showToast(error.message || 'Không thể đọc file CSV.', true);
    }
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

  async function showCapturedBlob(blob) {
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
    if (!file || !state.selectedStudent) return;
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
    if (!state.photoBlob || !state.selectedStudent) return;
    const student = state.selectedStudent;
    const filename = `${safeFileName(student.code)}.jpg`;
    const file = new File([state.photoBlob], filename, { type: 'image/jpeg', lastModified: Date.now() });

    try {
      if (state.directoryHandle) {
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
    elements.saveState.hidden = false;
    renderStudentList();
    showToast(`Đã lưu ${filename}`);
    if (goNext) selectNextStudent();
  }

  function selectNextStudent() {
    const students = currentClassStudents();
    if (!students.length || !state.selectedStudent) return;
    const currentIndex = students.findIndex((item) => item.key === state.selectedStudent.key);
    const next = students.slice(currentIndex + 1).find((item) => !state.captured.has(item.key))
      || students.find((item) => !state.captured.has(item.key));
    if (next) {
      clearPhotoPreview();
      selectStudent(next, true);
      if (state.stream) updateCameraStage();
    } else {
      clearPhotoPreview();
      showToast(`Đã chụp xong lớp ${elements.classSelect.value}.`);
    }
  }

  function retakePhoto() {
    clearPhotoPreview();
    if (!state.stream && isMobile) elements.nativeCameraInput.click();
  }

  function configurePlatform() {
    const hasDirectoryPicker = 'showDirectoryPicker' in window;
    elements.chooseFolderButton.hidden = !hasDirectoryPicker;
    elements.iosNote.hidden = !isIOS;
    if (isIOS) {
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
  });
  elements.studentSearch.addEventListener('input', renderStudentList);
  elements.openCameraButton.addEventListener('click', () => openCamera(elements.cameraSelect.value));
  elements.cameraSelect.addEventListener('change', () => openCamera(elements.cameraSelect.value));
  elements.nativeCameraInput.addEventListener('change', onNativePhoto);
  elements.captureButton.addEventListener('click', captureVideoFrame);
  elements.retakeButton.addEventListener('click', retakePhoto);
  elements.saveButton.addEventListener('click', () => savePhoto(false));
  elements.saveNextButton.addEventListener('click', () => savePhoto(true));
  elements.chooseFolderButton.addEventListener('click', chooseDirectory);
  document.querySelectorAll('.mobile-tab').forEach((button) => button.addEventListener('click', () => setMobileView(button.dataset.view)));
  window.addEventListener('beforeunload', stopCamera);

  configurePlatform();
  if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
