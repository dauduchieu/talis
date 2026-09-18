import "./swipe.js"
const $ = document.querySelector.bind(document)
let serviceWorkerRegistration = null

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).then(registration => {
            serviceWorkerRegistration = registration
            const checkForUpdate = () => registration.update().catch(() => {})
            checkForUpdate()
            window.setInterval(checkForUpdate, 5 * 60 * 1000)

            document.addEventListener("visibilitychange", () => {
                if (document.visibilityState === "visible") checkForUpdate()
            })
        }).catch(error => console.error("Could not register service worker:", error))

        navigator.serviceWorker.addEventListener("controllerchange", () => {
            // The new shell is active; reload once so the page uses its files.
            if (navigator.serviceWorker.controller) window.location.reload()
        })
    })
}

const rs = "ghsjkld6738enwek728e2j02ubr2u7392mdwgegewgweg"

const pages = ["home", "setting", "add", "history", "g"]
const activePage = target => {
    for (let page of pages) {
        if (page === target) {
            $(`.page.${page}`).classList.remove("hidden")
        } else {
            $(`.page.${page}`).classList.add("hidden")
        }
    }
}

$("body").addEventListener("swipe", e => {
    let targetPage
    switch (e.direction) {
        case "toleft":
            targetPage = "setting"
            break
        case "toright":
            targetPage = "history"
            break
        case "down":
            targetPage = "add"
            break
        default:
            targetPage = "home"
    }
    activePage(targetPage)
})

const datetime2tasktime = datetime => {
    const date = new Date(datetime)
    if (Number.isNaN(date.getTime())) return ""

    const pad = value => String(value).padStart(2, "0")
    const h = pad(date.getHours())
    const m = pad(date.getMinutes())
    const d = pad(date.getDate())
    const mo = pad(date.getMonth() + 1)
    return `${h}${m}·${d}${mo}`
}

const isToday = datetime => {
    const date = new Date(datetime)
    const today = new Date()

    return !Number.isNaN(date.getTime()) &&
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate()
}

const isOverdueToday = task => {
    if (task.doneTime || !isToday(task.datetime)) return false
    const date = new Date(task.datetime)
    return !Number.isNaN(date.getTime()) && date.getTime() < Date.now()
}

const isCompletedToday = task => {
    if (!task.doneTime) return false
    if (task.doneAt) return isToday(task.doneAt)
    return task.doneTime.endsWith(datetime2tasktime(new Date()).slice(5))
}

const DB_NAME = "talis"
const DB_VERSION = 3
const TASK_STORE = "tasks"
const SETTINGS_STORE = "settings"
const IMAGE_STORE = "images"

const openTaskDB = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(TASK_STORE)) {
            db.createObjectStore(TASK_STORE, { keyPath: "id" })
        }
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
            db.createObjectStore(SETTINGS_STORE, { keyPath: "id" })
        }
        if (!db.objectStoreNames.contains(IMAGE_STORE)) {
            const images = db.createObjectStore(IMAGE_STORE, { keyPath: "fileId", autoIncrement: true })
            images.createIndex("uploadedAt", "uploadedAt")
        }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
})

const galleryDB = openTaskDB

const readImages = async () => {
    const db = await galleryDB()
    return new Promise((resolve, reject) => {
        const request = db.transaction(IMAGE_STORE, "readonly").objectStore(IMAGE_STORE).getAll()
        request.onsuccess = () => resolve(request.result.sort((a, b) => b.uploadedAt - a.uploadedAt))
        request.onerror = () => reject(request.error)
    })
}

const writeImage = async image => {
    const db = await galleryDB()
    return new Promise((resolve, reject) => {
        const request = db.transaction(IMAGE_STORE, "readwrite").objectStore(IMAGE_STORE).add(image)
        request.onsuccess = () => resolve({ ...image, fileId: request.result })
        request.onerror = () => reject(request.error)
    })
}

const removeImage = async fileId => {
    const db = await galleryDB()
    return new Promise((resolve, reject) => {
        const request = db.transaction(IMAGE_STORE, "readwrite").objectStore(IMAGE_STORE).delete(fileId)
        request.onsuccess = resolve
        request.onerror = () => reject(request.error)
    })
}

const formatBytes = bytes => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const formatUploadDate = timestamp => new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
}).format(new Date(timestamp))

let galleryImages = []
let previewUrl = ""

const galleryGrid = $("#gallery-grid")
const galleryEmpty = $("#gallery-empty")
const galleryStatus = $("#gallery-status")
const galleryModal = $("#gallery-modal")

const renderGallery = () => {
    galleryGrid.replaceChildren()
    galleryEmpty.classList.toggle("hidden", galleryImages.length > 0)

    galleryImages.forEach(image => {
        const card = document.createElement("button")
        card.type = "button"
        card.className = "gallery-card"
        card.dataset.fileId = image.fileId
        card.title = image.name

        const thumbnail = document.createElement("img")
        thumbnail.src = URL.createObjectURL(image.blob)
        thumbnail.alt = image.name
        thumbnail.loading = "lazy"
        thumbnail.addEventListener("load", () => URL.revokeObjectURL(thumbnail.src), { once: true })

        const caption = document.createElement("span")
        caption.className = "gallery-card-caption"
        caption.textContent = image.name
        card.append(thumbnail, caption)
        galleryGrid.append(card)
    })
}

const openPreview = image => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    previewUrl = URL.createObjectURL(image.blob)
    $("#preview-image").src = previewUrl
    $("#preview-image").alt = image.name
    $("#preview-title").textContent = image.name
    $("#preview-meta").textContent = `${formatBytes(image.size)} · ${formatUploadDate(image.uploadedAt)} · ID ${image.fileId}`
    $("#preview-delete").dataset.fileId = image.fileId
    $("#preview-download").dataset.fileId = image.fileId
    galleryModal.classList.remove("hidden")
}

const closePreview = () => {
    galleryModal.classList.add("hidden")
    $("#preview-image").removeAttribute("src")
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    previewUrl = ""
}

const loadGallery = async () => {
    galleryImages = await readImages()
    renderGallery()
}

const persistGallery = async () => {
    if (!navigator.storage?.persist) return false
    try { return await navigator.storage.persist() } catch { return false }
}

loadGallery().catch(error => {
    galleryStatus.textContent = "Could not load the image archive."
    console.error("Could not load gallery:", error)
})
persistGallery().then(persisted => {
    galleryStatus.textContent = persisted ? "Stored securely on this device" : "Stored on this device"
})

$("#gallery-file-input").addEventListener("change", async event => {
    const files = [...event.target.files].filter(file => file.type.startsWith("image/"))
    if (!files.length) return
    galleryStatus.textContent = `Saving ${files.length} image${files.length > 1 ? "s" : ""}…`
    try {
        const saved = await Promise.all(files.map(file => writeImage({
            blob: file,
            name: file.name,
            type: file.type,
            size: file.size,
            uploadedAt: Date.now()
        })))
        galleryImages = [...saved, ...galleryImages].sort((a, b) => b.uploadedAt - a.uploadedAt)
        renderGallery()
        galleryStatus.textContent = `${galleryImages.length} image${galleryImages.length === 1 ? "" : "s"} in your archive`
    } catch (error) {
        galleryStatus.textContent = "Could not save those images."
        console.error("Could not save gallery images:", error)
    } finally {
        event.target.value = ""
    }
})

galleryGrid.addEventListener("click", event => {
    const card = event.target.closest(".gallery-card")
    const image = galleryImages.find(item => String(item.fileId) === card?.dataset.fileId)
    if (image) openPreview(image)
})

$("#preview-close").addEventListener("click", closePreview)
galleryModal.addEventListener("click", event => {
    if (event.target === galleryModal) closePreview()
})
$("#preview-download").addEventListener("click", event => {
    const fileId = Number(event.currentTarget.dataset.fileId)
    const image = galleryImages.find(item => item.fileId === fileId)
    if (!image) return

    const downloadUrl = URL.createObjectURL(image.blob)
    const link = document.createElement("a")
    link.href = downloadUrl
    link.download = image.name
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000)
})
$("#preview-delete").addEventListener("click", async event => {
    const fileId = Number(event.currentTarget.dataset.fileId)
    const image = galleryImages.find(item => item.fileId === fileId)
    if (!image || !window.confirm(`Delete “${image.name}”? This cannot be undone.`)) return

    try {
        await removeImage(fileId)
        galleryImages = galleryImages.filter(image => image.fileId !== fileId)
        closePreview()
        renderGallery()
        galleryStatus.textContent = "Image deleted"
    } catch (error) {
        console.error("Could not delete gallery image:", error)
    }
})
document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !galleryModal.classList.contains("hidden")) closePreview()
})

const readTasks = async () => {
    const db = await openTaskDB()

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(TASK_STORE, "readonly")
        const request = transaction.objectStore(TASK_STORE).getAll()

        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

const writeTask = async task => {
    const db = await openTaskDB()

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(TASK_STORE, "readwrite")
        const request = transaction.objectStore(TASK_STORE).put(task)

        request.onsuccess = () => resolve(task)
        request.onerror = () => reject(request.error)
    })
}

const readSettings = async () => {
    const db = await openTaskDB()

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(SETTINGS_STORE, "readonly")
        const request = transaction.objectStore(SETTINGS_STORE).get("current")

        request.onsuccess = () => resolve(request.result || {})
        request.onerror = () => reject(request.error)
    })
}

const writeSettings = async settings => {
    const db = await openTaskDB()

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(SETTINGS_STORE, "readwrite")
        const request = transaction.objectStore(SETTINGS_STORE).put({
            id: "current",
            ...settings
        })

        request.onsuccess = () => resolve(settings)
        request.onerror = () => reject(request.error)
    })
}

const loadSettings = async () => {
    const settings = await readSettings()

    $("#inp-llm-model-name").value = settings.llmModelName || ""
    $("#inp-llm-api-key").value = settings.llmApiKey || ""
    $("#inp-g-key").value = settings.gKey || ""
}

const initialTasks = []

let tasks = []

const loadTasks = async () => {
    tasks = await readTasks()

    // Preserve the demo tasks on the first run, then use IndexedDB afterward.
    if (tasks.length === 0) {
        tasks = [...initialTasks]
        await Promise.all(tasks.map(writeTask))
    }

    renderTask()
    renderHistory()
}

const renderTask = () => {
    $(".page.home .task-list").innerHTML = tasks.filter(task => !task.doneTime || isCompletedToday(task)).map(task => `
        <div class="task${task.doneTime ? " done" : ""}${isOverdueToday(task) ? " overdue" : ""}" data-task-id="${task.id}">
            <span class="task-name">${task.name}</span>
            <span class="task-time">${task.time}</span>
        </div>    
    `).join("\n")
}

const renderHistory = () => {
    $(".page.history .task-list").innerHTML = tasks.filter(task => task.doneTime).map(task => `
        <div class="task done" data-task-id="${task.id}">
            <span class="task-name">${task.name}</span>
            <span class="task-time">${task.time}</span>
            <span>[<span class="task-done-time">${task.doneTime}</span>]</span>
        </div>
    `).join("\n")
}

loadTasks().catch(error => console.error("Could not load tasks:", error))
loadSettings().catch(error => console.error("Could not load settings:", error))

const icsText = value => String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n")

const icsDate = date => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")

const downloadICS = (summary, startDate, endDate) => {
    if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) return

    const start = icsDate(startDate)
    const end = icsDate(endDate)
    const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@talis`
    const icsContent = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Talis//VN",
        "CALSCALE:GREGORIAN",
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${start}`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${icsText(summary || "Talis reminder")}`,
        "DESCRIPTION:Talis Reminder",
        "BEGIN:VALARM",
        "TRIGGER:-PT0M",
        "ACTION:DISPLAY",
        "DESCRIPTION:Reminder",
        "END:VALARM",
        "END:VEVENT",
        "END:VCALENDAR"
    ].join("\r\n")

    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${(summary || "reminder").replace(/[\\/:*?"<>|]+/g, "-")}.ics`
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}

$("#btn-add-task").addEventListener("click", async () => {
    const datetime = $("#inp-task-datetime").value.trim()
    const taskName = $("#inp-task-name").value.trim()
    const settings = await readSettings()

    if (taskName === settings.gKey) {
        if (datetime.indexOf(`${rs[22]}${rs[16]}-${rs[22]}${rs[29]}`) !== -1) {
            $("#inp-task-datetime").value = ""
            $("#inp-task-name").value = ""
            activePage("g")
            return
        } else {
            $("#inp-task-datetime").value = ""
            $("#inp-task-name").value = ""
            // activePage("home")
            return
        }
    }

    const task = {
        id: Date.now(),
        name: taskName,
        datetime: datetime,
        time: datetime2tasktime(datetime),
        doneTime: ""
    }

    try {
        await writeTask(task)
        tasks.push(task)
        const startDate = new Date(datetime)
        if (!Number.isNaN(startDate.getTime())) {
            downloadICS(taskName, startDate, new Date(startDate.getTime() + 60 * 60 * 1000))
        }
    } catch (error) {
        console.error("Could not save task:", error)
        return
    }

    $("#inp-task-datetime").value = ""
    $("#inp-task-name").value = ""
    activePage("home")
    renderTask()
    renderHistory()
})

const clearAllData = async () => {
    const db = await openTaskDB()
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([...db.objectStoreNames], "readwrite")
        for (const storeName of db.objectStoreNames) transaction.objectStore(storeName).clear()
        transaction.oncomplete = resolve
        transaction.onerror = () => reject(transaction.error)
        transaction.onabort = () => reject(transaction.error || new Error("Reset aborted"))
    })
}

$("#btn-save-setting").addEventListener("click", async () => {
    const settings = {
        llmModelName: $("#inp-llm-model-name").value.trim(),
        llmApiKey: $("#inp-llm-api-key").value.trim(),
        gKey: $("#inp-g-key").value.trim()
    }

    try {
        await writeSettings(settings)
        activePage("home")
    } catch (error) {
        console.error("Could not save settings:", error)
    }
})

$("#btn-update-app").addEventListener("click", async event => {
    const status = $("#update-status")
    const button = event.currentTarget
    if (!navigator.onLine) {
        status.textContent = "Offline - using current version"
        return
    }

    button.disabled = true
    status.textContent = "Checking for updates…"
    try {
        const response = await fetch("./index.html", { cache: "reload" })
        if (!response.ok) throw new Error("Update check failed")
        await caches.delete("talis-shell-v2")
        if (serviceWorkerRegistration) await serviceWorkerRegistration.update()
        status.textContent = "Updated - reloading…"
        window.location.reload()
    } catch (error) {
        status.textContent = "Could not update; current version kept"
        button.disabled = false
        console.error("Could not update app:", error)
    }
})

let resetCode = ""

$("#btn-reset-all").addEventListener("click", () => {
    const values = new Uint32Array(1)
    crypto.getRandomValues(values)
    resetCode = String(values[0] % 1000000).padStart(6, "0")
    $("#reset-code").textContent = resetCode
    $("#inp-reset-code").value = ""
    $("#reset-status").textContent = ""
    $("#reset-confirm").classList.remove("hidden")
    $("#inp-reset-code").focus()
})

$("#btn-cancel-reset").addEventListener("click", () => {
    resetCode = ""
    $("#reset-confirm").classList.add("hidden")
    $("#inp-reset-code").value = ""
})

$("#btn-confirm-reset").addEventListener("click", async () => {
    const inputCode = $("#inp-reset-code").value.trim()
    if (inputCode !== resetCode) {
        $("#reset-status").textContent = "Incorrect reset code. Nothing was deleted."
        return
    }

    try {
        await clearAllData()
        tasks = []
        galleryImages = []
        renderTask()
        renderHistory()
        renderGallery()
        $("#inp-llm-model-name").value = ""
        $("#inp-llm-api-key").value = ""
        $("#inp-g-key").value = ""
        resetCode = ""
        $("#reset-confirm").classList.add("hidden")
        $("#reset-status").textContent = "All data deleted."
        closePreview()
    } catch (error) {
        $("#reset-status").textContent = "Could not delete all data."
        console.error("Could not reset all data:", error)
    }
})

const setTaskDone = async (element, done) => {
    const taskData = tasks.find(item => String(item.id) === element.dataset.taskId)
    if (!taskData) return

    if (done && taskData.doneTime) return

    const previousDoneTime = taskData.doneTime
    const previousDoneAt = taskData.doneAt
    taskData.doneTime = done ? datetime2tasktime(new Date()) : ""
    taskData.doneAt = done ? new Date().toISOString() : ""

    try {
        await writeTask(taskData)
        renderTask()
        renderHistory()
    } catch (error) {
        taskData.doneTime = previousDoneTime
        taskData.doneAt = previousDoneAt
        console.error("Could not update task:", error)
    }
}

$(".page.home .task-list").addEventListener("click", event => {
    const element = event.target.closest(".task")
    if (!element) return
    setTaskDone(element, true)
})

$(".page.home .task-list").addEventListener("dblclick", event => {
    const element = event.target.closest(".task")
    if (!element) return
    setTaskDone(element, false)
})
