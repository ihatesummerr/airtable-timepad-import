var timepad = new Request(
	'https://api.timepad.ru/v1/events?limit=1&skip=0&sort=date&fields=location,description_short,description_html,poster_image'
);
var headers = {
	'Content-type': 'application/json',
	Authorization: 'Bearer API_KEY',
};

var geocode = new Request(
	'https://maps.googleapis.com/maps/api/geocode/json',
	{}
);

async function* get_records(from) {
	while (true) {
		const res = await remoteFetchAsync(
			`https://api.timepad.ru/v1/events?limit=1&skip=${from}&sort=date&fields=location,description_short,description_html,poster_image`,
			{
				method: 'GET',
				headers: headers,
			}
		);

		const data = await res.json();

		// console.log(data);

		const records = await Promise.all(
			data.values.map(async (record) => {
				var result = Object.create(null);
				var location = await get_location(record?.location);

				result['id_timepad'] = record.id;
				result['name'] = record.name;
				result['desc_short'] = record.description_short;
				result['desc_html'] = record.description_html;
				result['url'] = record.url;

				if (record.poster_image) {
					result['img_default'] = record.poster_image.default_url;
					result['img_uploadcare'] =
						record.poster_image.uploadcare_url;
				}

				result['country'] = record?.location.country;
				result['city'] = record?.location.city;
				result['address'] = record?.location.address;

				if (location.status === 'Ok') {
					result['country'] =
						location.data.address_components.country;
					result['country_code'] =
						location.data.address_components.country_code;
					result['city'] = location.data.address_components.city;
					result['address'] = location.data.formatted_address;
					result['longitude'] = location.data.coords.lng;
					result['latitude'] = location.data.coords.lat;
				} else if (location.status === 'Not found') {
					result['country_code'] =
						location.data.address_components.country_code;
				}

				result['category'] = record.categories[0].name;
				result['date'] = record.starts_at;
				result['duplicates'] = '';
				result['dates'] = '';

				return result;
			})
		);

		yield records[0];
		from++;
	}
}

async function get_location(location) {
	if (location) {
		let res = await remoteFetchAsync(
			'https://maps.googleapis.com/maps/api/geocode/json?' +
				new URLSearchParams({
					address: location.address,
					key: 'API_KEY',
					language: 'ru',
				})
		);

		let { results } = await res.json();

		if (results[0]) {
			let components = {};

			results[0].address_components.forEach((component) => {
				switch (component.types[0]) {
					case 'locality':
						components['city'] = component.long_name;
						break;
					case 'country':
						components['country'] = component.long_name;
						components['country_code'] = component.short_name;
						break;
				}
			});

			return {
				status: 'Ok',
				data: {
					address_components: components,
					formatted_address: results[0].formatted_address,
					coords: results[0].geometry.location,
				},
			};
		}
		res = await remoteFetchAsync(
			'https://maps.googleapis.com/maps/api/geocode/json?' +
				new URLSearchParams({
					address: location.country,
					key: 'API_KEY',
					language: 'ru',
				})
		);
		({ results } = await res.json());

		let components = {};

		components['country'] = results[0].address_components[0].long_name;
		components['country_code'] =
			results[0].address_components[0].short_name;

		return {
			status: 'Not found',
			data: {
				address_components: components,
				formatted_address: location.address,
			},
		};
	} else {
		return {
			status: 'None',
			data: {
				location,
			},
		};
	}
}

var table = base.getTable('Timepad');

var existing = Object.create(null);

var records = await get_records(
	await input.textAsync('Введите id последней записи')
);

while (true) {
	var record = (await records.next()).value;
	var key = JSON.stringify([record.name, record.desc_short]);

	if (key in existing) {
		var existingRecord = await table.selectRecordAsync(existing[key]);

		table.updateRecordAsync(existingRecord, {
			duplicates:
				record.id_timepad +
					'; ' +
					existingRecord.getCellValue('duplicates') ?? ' ',
			dates:
				new Date(record.date).toLocaleDateString('ru-RU') +
					'; ' +
					existingRecord.getCellValue('dates') ?? ' ',
		});
	} else {
		existing[key] = await table.createRecordAsync(record);
	}
}
