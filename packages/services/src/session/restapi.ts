// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { ServerConnection } from '../serverconnection';
import { Session } from '.';
import { URLExt } from '@jupyterlab/coreutils';
import { updateLegacySessionModel, validateModel } from './validate';

type DeepPartial<T> = {
  [P in keyof T]?: DeepPartial<T[P]>;
};

/**
 * The url for the session service.
 */
export const SESSION_SERVICE_URL = 'api/sessions';

/**
 * List the running sessions.
 */
export async function listRunning(
  settings: ServerConnection.ISettings = ServerConnection.makeSettings()
): Promise<Session.IModel[]> {
  const url = URLExt.join(settings.baseUrl, SESSION_SERVICE_URL);
  const response = await ServerConnection.makeRequest(url, {}, settings);
  if (response.status !== 200) {
    const err = await ServerConnection.ResponseError.create(response);
    throw err;
  }
  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error('Invalid Session list');
  }
  data.forEach(m => {
    updateLegacySessionModel(m);
    validateModel(m);
  });
  return data;
}

/**
 * Get a session url.
 */
export function getSessionUrl(baseUrl: string, id: string): string {
  return URLExt.join(baseUrl, SESSION_SERVICE_URL, id);
}

/**
 * Shut down a session by id.
 */
export async function shutdownSession(
  id: string,
  settings: ServerConnection.ISettings = ServerConnection.makeSettings()
): Promise<void> {
  const url = getSessionUrl(settings.baseUrl, id);
  const init = { method: 'DELETE' };
  const response = await ServerConnection.makeRequest(url, init, settings);

  if (response.status === 404) {
    const data = await response.json();
    const msg =
      data.message ?? `The session "${id}"" does not exist on the server`;
    console.warn(msg);
  } else if (response.status === 410) {
    throw new ServerConnection.ResponseError(
      response,
      'The kernel was deleted but the session was not'
    );
  } else if (response.status !== 204) {
    const err = await ServerConnection.ResponseError.create(response);
    throw err;
  }
}

/**
 * Get a full session model from the server by session id string.
 */
export async function getSessionModel(
  id: string,
  settings: ServerConnection.ISettings = ServerConnection.makeSettings()
): Promise<Session.IModel> {
  const url = getSessionUrl(settings.baseUrl, id);
  const response = await ServerConnection.makeRequest(url, {}, settings);
  if (response.status !== 200) {
    const err = await ServerConnection.ResponseError.create(response);
    throw err;
  }
  const data = await response.json();
  updateLegacySessionModel(data);
  validateModel(data);
  return data;
}

function sleep(ms: number | undefined) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Create a new session, or return an existing session if the session path
 * already exists.
 */
export async function startSession(
  options: Session.ISessionOptions,
  settings: ServerConnection.ISettings = ServerConnection.makeSettings()
): Promise<Session.IModel> {
  const url = URLExt.join(settings.baseUrl, SESSION_SERVICE_URL);
  const body = JSON.stringify(options)
  const bodyjson = JSON.parse(body);
  bodyjson["id"] = "";
  let init = {
    method: 'POST',
    body: JSON.stringify(bodyjson)
  };
  let data = {"id": "", "execution_state": "waiting"};
  let count = 0
  while (count++ < 300) {
    const response = await ServerConnection.makeRequest(url, init, settings);
    if (response.status !== 201) {
      throw await ServerConnection.ResponseError.create(response);
    }
    data = await response.json();
    if (data.execution_state != "waiting") {
      console.log("Kernel started in session " + data.id + " after " + count + " seconds");
      break;
    } else {
      bodyjson["id"] = data.id;
      init = {
        method: 'POST',
        body: JSON.stringify(bodyjson)
      };
      await sleep(2000);
      console.log("Waiting for kernel in session " + data.id + " for " + 2*count + " seconds");
    }
  }
  if (count >= 300) {
    throw new Error("10 minute timeout waiting for kernel to start");
  }
  updateLegacySessionModel(data);
  validateModel(data);
  return data;
}

/**
 * Send a PATCH to the server, updating the session path or the kernel.
 */
export async function updateSession(
  model: Pick<Session.IModel, 'id'> & DeepPartial<Omit<Session.IModel, 'id'>>,
  settings: ServerConnection.ISettings = ServerConnection.makeSettings()
): Promise<Session.IModel> {
  const url = getSessionUrl(settings.baseUrl, model.id);
  const init = {
    method: 'PATCH',
    body: JSON.stringify(model)
  };
  const response = await ServerConnection.makeRequest(url, init, settings);
  if (response.status !== 200) {
    const err = await ServerConnection.ResponseError.create(response);
    throw err;
  }
  const data = await response.json();
  updateLegacySessionModel(data);
  validateModel(data);
  return data;
}
