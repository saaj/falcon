import chai, {expect, assert} from 'chai';
import spies from 'chai-spies';
chai.use(spies);

import fs from 'fs';
import {merge, dissoc, has} from 'ramda';

import QueryScheduler from '../../../backend/persistent/QueryScheduler.js';
import {
    QUERIES_PATH,
    CREDENTIALS_PATH
} from '../../../backend/utils/homeFiles.js';
import {saveCredential} from '../../../backend/persistent/Credentials.js';
import {getQuery, getQueries} from '../../../backend/persistent/Queries.js';
import { PlotlyAPIRequest,
    updateGrid
} from '../../../backend/persistent/PlotlyAPI.js';
import {createGrid, names, credentials, username, apiKey} from '../utils.js';

let queryScheduler;
describe('QueryScheduler', () => {
    beforeEach(() => {
        try {
            fs.unlinkSync(QUERIES_PATH);
        } catch (e) {}
        // try {
        //     fs.unlinkSync(CREDENTIALS_PATH);
        // } catch (e) {}
        queryScheduler = new QueryScheduler();
    });

    afterEach(() => {
        queryScheduler.clearQueries();
        queryScheduler = null;

    });

    it('executes a function on an interval', (done) => {
        const spy = chai.spy(() => {});
        const queryScheduler = new QueryScheduler();
        queryScheduler.job = spy;

        const delay = 100;
        queryScheduler.scheduleQuery({
            refreshRate: delay,
            fid: '...',
            uids: '...',
            query: '...',
            credentialId: '...',
            username,
            apiKey
        });
        setTimeout(function() {
            expect(spy).to.have.been.called();
        }, delay + 1);
        setTimeout(function() {
            expect(spy).to.have.been.called.twice();
            done();
        }, delay * 3);
    });

    it('saves queries to file', () => {
        const queryScheduler = new QueryScheduler();
        queryScheduler.job = () => {};

        const queryObject = {
            refreshRate: 1,
            fid: 'test-fid',
            uids: '',
            query: '',
            credentialId: 'unique-id',
            username,
            apiKey
        };
        queryScheduler.scheduleQuery(queryObject);
        let queriesFromFile = getQueries();
        assert.deepEqual(queriesFromFile, [queryObject]);

        const anotherQuery = merge(queryObject, {fid: 'new-fid'});
        queryScheduler.scheduleQuery(anotherQuery);
        queriesFromFile = getQueries();
        assert.deepEqual(queriesFromFile,
            [queryObject, anotherQuery]
        );
    });

    it.only('queries a database and updates a plotly grid on an interval', function(done) {
        console.warn('running test');
        function checkGridAgainstQuery(fid) {
            return PlotlyAPIRequest(`grids/${fid}/content`, {}, username, apiKey, 'GET')
            .then(res => res.json().then(json => {
                assert.equal(res.status, 200);
                assert.deepEqual(
                    json.cols[names[0]].data,
                    ['Guinea', 'Guinea']
                );
                assert.deepEqual(
                    json.cols[names[1]].data,
                    [3, 4]
                );
                assert.deepEqual(
                    json.cols[names[2]].data,
                    [14, 14]
                );
                assert.deepEqual(
                    json.cols[names[3]].data,
                    ['9.95', '9.95']
                );
                assert.deepEqual(
                    json.cols[names[4]].data,
                    ['-9.7', '-9.7']
                );
                assert.deepEqual(
                    json.cols[names[5]].data,
                    ['122', '224']
                );
            }));
        }

        function resetAndVerifyGridContents(fid, uids) {
            return updateGrid([[1, 2, 3, 4, 5, 6]], fid, uids, username, apiKey)

            // Verify that the grid was updated
            .then(res => {
                assert(res.status, 200);
                return PlotlyAPIRequest(`grids/${fid}/content`, {}, username, apiKey, 'GET');
            })
            .then(res => res.json().then(json => {
                assert(res.status, 200);
                assert.deepEqual(json.cols[names[0]].data, [1]);
                assert.deepEqual(json.cols[names[1]].data, [2]);
                assert.deepEqual(json.cols[names[2]].data, [3]);
                assert.deepEqual(json.cols[names[3]].data, [4]);
                assert.deepEqual(json.cols[names[4]].data, [5]);
                assert.deepEqual(json.cols[names[5]].data, [6]);
            }));
        }

        const refreshRate = 30 * 1000;
        this.timeout(refreshRate * 10);

        /*
         * Save the credentials to a file.
         * This is done by the UI or by the user.
        */
        const credentialId = saveCredential(credentials);

        /*
         * Create a grid that we want to update with new data
         * Note that the scheduler doesn't ever actually create grids,
         * it only updates them
         */
         createGrid('test interval').then(res => res.json().then(json => {
             assert.equal(res.status, 201);
             const fid = json.file.fid;
             const uids = json.file.cols.map(col => col.uid);

             const queryScheduler = new QueryScheduler();
             const queryObject = {
                 fid,
                 uids,
                 refreshRate,
                 credentialId,
                 username,
                 apiKey,
                 query: 'SELECT * from ebola_2014 LIMIT 2'
             };
             queryScheduler.scheduleQuery(queryObject);


             /*
              * After refreshRate seconds, the scheduler will update the grid's contents.
              * Download the grid's contents and check.
              */
             setTimeout(() => {
                 checkGridAgainstQuery(fid)
                 .then(() => {
                    /*
                     * Now check that _another_ update happens.
                     * Update the grids contents and then wait for
                     * the scheduler to update the contents.
                     */
                     return resetAndVerifyGridContents(fid, uids);
                 })
                 .then(() => {
                     setTimeout(() => {
                         checkGridAgainstQuery(fid)
                         .then(() => {
                             /*
                              * Now update the contents again
                              * and delete the grid and verify
                              * that the grid doesn't get updated
                              * and that the query gets deleted
                              * from memory and from the disk
                              */
                             assert(has(fid, queryScheduler.queryJobs));
                             assert.deepEqual(getQuery(fid), queryObject);
                             assert.deepEqual(queryScheduler[fid], queryObject);
                             return PlotlyAPIRequest(`grids/${fid}`, {}, username, apiKey, 'DELETE');
                         })
                         .then(res => {
                             assert(res.status, 200);
                             setTimeout(() => {
                                 assert(!has(fid, queryScheduler.queryJobs));
                                 assert.isNull(getQuery(fid));
                                 done();
                             }, refreshRate);
                         })
                         .catch(done);
                     }, refreshRate);
                 })
                 .catch(done);
            }, refreshRate + (5 * 1000)); // Give scheduleQuery an extra 5 seconds.
        })).catch(done);
    });

});
