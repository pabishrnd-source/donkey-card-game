import { details as detailsUtility } from '../../../utils/details.js';
import { getEntrypoint } from '../../../utils/get-entrypoint.js';
import { workThroughQueue } from '../utils/workThroughQueue.js';
/**
 * Run the chained tasks and return just some basic information about the OpenAPI document
 */
export async function details(queue) {
    const { filesystem } = await workThroughQueue(queue);
    return detailsUtility(getEntrypoint(filesystem).specification);
}
