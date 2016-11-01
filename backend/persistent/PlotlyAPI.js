import fetch from 'node-fetch';
import {getSetting} from '../settings.js';
import Logger from '../logger';

export function PlotlyAPIRequest(relativeUrl, body, username, apiKey, method = 'POST') {
    return fetch(`${getSetting('PLOTLY_API_DOMAIN')}/v2/${relativeUrl}`, {
        method,
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Plotly-Client-Platform': 'db-connect',
            'Authorization': 'Basic ' + new Buffer(
                username + ':' + apiKey
            ).toString('base64')
        },
        body: JSON.stringify(body)
    });
}


export function updateGrid(rows, fid, uids) {
    const username = fid.split(':')[0];
    const user = getSetting('USERS').find(
        u => u.username === username
    );
    if (!user || !user.apikey) {
        Logger.log(
            `Attempting to update grid ${fid} but can't find the
             credentials for the user "${username}".`, 0
        );
        return Promise.reject(new Error('Unauthenticated'));
    }
    const apikey = user.apikey;

    // TODO - Test case where no rows are returned.
    if (uids.length !== rows[0].length) {
        Logger.log(`
            A different number of columns was returned in the
            query than what was initially saved in the grid.
            ${rows[0].length} columns were queried,
            ${uids.length} columns were originally saved.
            The connector does not create columns (yet),
            and so we will only update the first ${uids.length}
            columns.
        `);
    }

    const columns = uids.map(() => []);
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        /*
         * For now, only update up to the number of columns that are
         * already saved. In the future, we should just create more
         * columns. See error message above.
         */
        for (let j = 0; j < Math.min(uids.length, row.length); j++) {
            columns[j][i] = row[j];
        }
    }
    const url = `grids/${fid}/col?uid=${uids.join(',')}`;
    const body = {
        cols: JSON.stringify(columns.map(column => ({
            data: column
        })))
    };
    return PlotlyAPIRequest(url, body, username, apikey, 'PUT');
}
