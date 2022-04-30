import axios from 'axios';
import Airtable from 'airtable';
import crypto from 'crypto';
import fs from 'fs';

const timepad = axios.create({
	baseURL: 'https://api.timepad.ru/v1',
});

const geocode = axios.create({
	baseURL: 'https://maps.googleapis.com/maps/api/geocode/json',
});

timepad.defaults.headers.common['Authorization'] =
	'Bearer c0b2ae3e9a442d01a7f2c2a7db10c913d3d8cb07';

async function get_record(skip) {
	const { data } = await timepad.get(
		`/events?limit=1&skip=${skip}&sort=date&fields=location,description_short,description_html,poster_image`
	);

	const records = await Promise.all(
		data.values.map(async (record) => {
			let address = record?.location.address;
			let location = await get_location(address);

			return {
				id_timepad: record.id,
				name: record.name,
				desc_short: record.description_short,
				desc_html: record.description_html,
				url: record.url,
				img_default:
					record?.poster_image?.default_url ?? 'нет изображения',
				img_uploadcare:
					record?.poster_image?.uploadcare_url ?? 'нет изображения',
				country: record?.location.country,
				city: record?.location.city,
				address: location?.formatted_address ?? address,
				latitude: location?.coords?.lat,
				longitude: location?.coords?.lng,
				category: record.categories.reduce(
					(acc, c) => c.name + '; ',
					''
				),
				date: new Date(record.starts_at).toLocaleString(),
				dups: '',
				dates: '',
			};
		})
	);

	return records[0];
}

async function get_location(address) {
	if (address) {
		const {
			data: { results },
		} = await geocode.get('', {
			params: {
				address,
				key: 'AIzaSyD2rrVSeVuthc0PrKESgtE6-5J3SHA7AV0',
				language: 'ru',
			},
		});

		if (results[0]) {
			return {
				address_components: results[0].address_components,
				formatted_address: results[0].formatted_address,
				coords: results[0].geometry.location,
			};
		} else {
			return address;
		}
	} else {
		return address;
	}
}

const base = new Airtable({ apiKey: 'keyrgqKgkao7iwzmh' }).base(
	'appfoz9p6W2p7EPEp'
);

const data = fs.existsSync('./data.json')
	? JSON.parse(fs.readFileSync('./data.json'))
	: undefined;

const descs = data ? new Map(data.descs) : new Map();
const names = data ? new Map(data.names) : new Map();
let i = data ? data.i : 0;

setInterval(async () => {
	const record = await get_record(i);
	let desc_hash = crypto
		.createHash('md5')
		.update(record.desc_short)
		.digest('hex');
	let name_hash = crypto.createHash('md5').update(record.name).digest('hex');
	if (!(descs.has(desc_hash) && names.has(name_hash))) {
		base('Timepad').create(record, function (err, record) {
			if (err) {
				console.error(err);
				return;
			}
			descs.set(desc_hash, record.id);
			names.set(name_hash, record.id);
		});
	} else {
		let parent_id;
		if (descs.has(desc_hash)) {
			parent_id = descs.get(desc_hash);
		}
		if (names.has(name_hash)) {
			parent_id = names.get(name_hash);
		}
		base('Timepad').find(parent_id, (err, parent) => {
			if (err) {
				console.error(err);
				return;
			}
			if (!parent.fields.dups) {
				parent.patchUpdate({
					dups: record.id_timepad.toString(),
					dates: record.date,
				});
			} else {
				parent.patchUpdate({
					dups:
						parent.fields.dups +
						', ' +
						record.id_timepad.toString(),
					dates: parent.fields.dates + ', ' + record.date,
				});
			}
		});
	}
	i++;
	await fs.writeFile(
		'./data.json',
		JSON.stringify(
			{
				descs: Array.from(descs.entries()),
				names: Array.from(names.entries()),
				i: i,
			},
			null,
			'\t'
		),
		(err) => {
			if (err) {
				console.error(err);
				return;
			}
		}
	);
}, 2000);
