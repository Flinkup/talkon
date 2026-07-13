// Build a CSV string and trigger a download. UTF-8 BOM is prepended so Excel
// (Windows, Hebrew) opens it with correct encoding.

function escapeCell(value) {
  if (value == null) return ''
  const s = String(value)
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

// rows: array of objects; columns: [{ key, header }]
export function toCsv(rows, columns) {
  const header = columns.map((c) => escapeCell(c.header)).join(',')
  const body = rows
    .map((row) => columns.map((c) => escapeCell(row[c.key])).join(','))
    .join('\r\n')
  return `${header}\r\n${body}`
}

export function downloadCsv(filename, csvString) {
  const blob = new Blob(['﻿' + csvString], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
