import path from "node:path";
import { promises as fs } from "node:fs";
import { BrowserWindow, dialog, type IpcMainInvokeEvent, type OpenDialogOptions, type SaveDialogOptions } from "electron";

const JSON_FILE_FILTERS = [{ name: "JSON Files", extensions: ["json"] }];

function get_error_message(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error.";
}

function ensure_json_file_extension(file_path: string) {
  return path.extname(file_path).length === 0 ? `${file_path}.json` : file_path;
}

function get_dialog_window(event: IpcMainInvokeEvent) {
  return BrowserWindow.fromWebContents(event.sender);
}

async function show_save_dialog_for_event(event: IpcMainInvokeEvent, dialog_options: SaveDialogOptions) {
  const browser_window = get_dialog_window(event);
  return browser_window
    ? dialog.showSaveDialog(browser_window, dialog_options)
    : dialog.showSaveDialog(dialog_options);
}

async function show_open_dialog_for_event(event: IpcMainInvokeEvent, dialog_options: OpenDialogOptions) {
  const browser_window = get_dialog_window(event);
  return browser_window
    ? dialog.showOpenDialog(browser_window, dialog_options)
    : dialog.showOpenDialog(dialog_options);
}

async function choose_json_file_for_save(event: IpcMainInvokeEvent, title: string, default_path: string) {
  const dialog_result = await show_save_dialog_for_event(event, {
    title,
    defaultPath: default_path,
    filters: JSON_FILE_FILTERS,
  });

  if (dialog_result.canceled || !dialog_result.filePath) {
    return null;
  }

  return ensure_json_file_extension(dialog_result.filePath);
}

async function choose_json_file_for_open(event: IpcMainInvokeEvent, title: string, default_path: string) {
  const dialog_result = await show_open_dialog_for_event(event, {
    title,
    defaultPath: default_path,
    filters: JSON_FILE_FILTERS,
    properties: ["openFile"],
  });

  const file_path = dialog_result.filePaths[0];
  if (dialog_result.canceled || !file_path) {
    return null;
  }

  return file_path;
}

async function write_json_file(file_path: string, value: unknown) {
  await fs.writeFile(file_path, JSON.stringify(value, null, 2), "utf8");
}

export async function read_json_file<T>(file_path: string, parse: (value: unknown) => T) {
  const file_contents = await fs.readFile(file_path, "utf8");
  return parse(JSON.parse(file_contents));
}

export async function save_json_file(
  event: IpcMainInvokeEvent,
  {
    title,
    default_path,
    value,
  }: {
    title: string;
    default_path: string;
    value: unknown;
  },
) {
  const file_path = await choose_json_file_for_save(event, title, default_path);
  if (!file_path) {
    return null;
  }

  await write_json_file(file_path, value);
  return file_path;
}

export async function open_json_file<T>(
  event: IpcMainInvokeEvent,
  {
    title,
    default_path,
    load_file,
    error_label,
  }: {
    title: string;
    default_path: string;
    load_file: (file_path: string) => Promise<T>;
    error_label: string;
  },
) {
  const file_path = await choose_json_file_for_open(event, title, default_path);
  if (!file_path) {
    return null;
  }

  try {
    return await load_file(file_path);
  } catch (error) {
    throw new Error(`Could not ${error_label} from ${path.basename(file_path)}: ${get_error_message(error)}`);
  }
}