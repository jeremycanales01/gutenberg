/* eslint-disable jest/no-try-expect */
/**
 * External dependencies
 */
const { readFile, stat } = require( 'fs' ).promises;
const os = require( 'os' );

/**
 * Internal dependencies
 */
const { readConfig, ValidationError } = require( '..' );
const detectDirectoryType = require( '../detect-directory-type' );

jest.mock( 'fs', () => ( {
	promises: {
		readFile: jest.fn(),
		stat: jest.fn().mockReturnValue( Promise.resolve( false ) ),
	},
} ) );

jest.mock( '../detect-directory-type', () => jest.fn() );

describe( 'readConfig', () => {
	beforeEach( () => {
		jest.clearAllMocks();
	} );

	it( 'should throw a validation error if config is invalid JSON', async () => {
		readFile.mockImplementation( () => Promise.resolve( '{' ) );
		expect.assertions( 2 );
		try {
			await readConfig( '.wp-env.json' );
		} catch ( error ) {
			expect( error ).toBeInstanceOf( ValidationError );
			expect( error.message ).toContain( 'Invalid .wp-env.json' );
		}
	} );

	it( 'should throw a validation error if config cannot be read', async () => {
		readFile.mockImplementation( () =>
			Promise.reject( { message: 'Uh oh!' } )
		);
		expect.assertions( 2 );
		try {
			await readConfig( '.wp-env.json' );
		} catch ( error ) {
			expect( error ).toBeInstanceOf( ValidationError );
			expect( error.message ).toContain( 'Could not read .wp-env.json' );
		}
	} );

	it( 'should infer a core config when ran from a core directory', async () => {
		readFile.mockImplementation( () =>
			Promise.reject( { code: 'ENOENT' } )
		);
		detectDirectoryType.mockImplementation( () => 'core' );
		const config = await readConfig( '.wp-env.json' );
		expect( config.env.development.coreSource ).not.toBeNull();
		expect( config.env.tests.coreSource ).not.toBeNull();
		expect( config.env.development.pluginSources ).toHaveLength( 0 );
		expect( config.env.development.themeSources ).toHaveLength( 0 );
	} );

	it( 'should infer a plugin config when ran from a plugin directory', async () => {
		readFile.mockImplementation( () =>
			Promise.reject( { code: 'ENOENT' } )
		);
		detectDirectoryType.mockImplementation( () => 'plugin' );
		const config = await readConfig( '.wp-env.json' );
		expect( config.env.development.coreSource ).toBeNull();
		expect( config.env.development.pluginSources ).toHaveLength( 1 );
		expect( config.env.tests.pluginSources ).toHaveLength( 1 );
		expect( config.env.development.themeSources ).toHaveLength( 0 );
	} );

	it( 'should infer a theme config when ran from a theme directory', async () => {
		readFile.mockImplementation( () =>
			Promise.reject( { code: 'ENOENT' } )
		);
		detectDirectoryType.mockImplementation( () => 'theme' );
		const config = await readConfig( '.wp-env.json' );
		expect( config.env.development.coreSource ).toBeNull();
		expect( config.env.tests.coreSource ).toBeNull();
		expect( config.env.development.themeSources ).toHaveLength( 1 );
		expect( config.env.tests.themeSources ).toHaveLength( 1 );
		expect( config.env.development.pluginSources ).toHaveLength( 0 );
		expect( config.env.tests.pluginSources ).toHaveLength( 0 );
	} );

	it( "should throw a validation error if 'core' is not a string", async () => {
		readFile.mockImplementation( () =>
			Promise.resolve( JSON.stringify( { core: 123 } ) )
		);
		expect.assertions( 2 );
		try {
			await readConfig( '.wp-env.json' );
		} catch ( error ) {
			expect( error ).toBeInstanceOf( ValidationError );
			expect( error.message ).toContain( 'must be null or a string' );
		}
	} );

	it( "should throw a validation error if 'plugins' is not an array of strings", async () => {
		readFile.mockImplementation( () =>
			Promise.resolve( JSON.stringify( { plugins: [ 'test', 123 ] } ) )
		);
		expect.assertions( 2 );
		try {
			await readConfig( '.wp-env.json' );
		} catch ( error ) {
			expect( error ).toBeInstanceOf( ValidationError );
			expect( error.message ).toContain( 'must be an array of strings' );
		}
	} );

	it( "should throw a validation error if 'themes' is not an array of strings", async () => {
		readFile.mockImplementation( () =>
			Promise.resolve( JSON.stringify( { themes: [ 'test', 123 ] } ) )
		);
		expect.assertions( 2 );
		try {
			await readConfig( '.wp-env.json' );
		} catch ( error ) {
			expect( error ).toBeInstanceOf( ValidationError );
			expect( error.message ).toContain( 'must be an array of strings' );
		}
	} );

	it( 'should parse local sources', async () => {
		readFile.mockImplementation( () =>
			Promise.resolve(
				JSON.stringify( {
					plugins: [ './relative', '../parent', '~/home' ],
				} )
			)
		);
		const config = await readConfig( '.wp-env.json' );
		expect( config.env.development ).toMatchObject( {
			pluginSources: [
				{
					type: 'local',
					path: expect.stringMatching( /^\/.*relative$/ ),
					basename: 'relative',
				},
				{
					type: 'local',
					path: expect.stringMatching( /^\/.*parent$/ ),
					basename: 'parent',
				},
				{
					type: 'local',
					path: expect.stringMatching( /^\/.*home$/ ),
					basename: 'home',
				},
			],
		} );
		expect( config.env.tests ).toMatchObject( {
			pluginSources: [
				{
					type: 'local',
					path: expect.stringMatching( /^\/.*relative$/ ),
					basename: 'relative',
				},
				{
					type: 'local',
					path: expect.stringMatching( /^\/.*parent$/ ),
					basename: 'parent',
				},
				{
					type: 'local',
					path: expect.stringMatching( /^\/.*home$/ ),
					basename: 'home',
				},
			],
		} );
	} );

	it( "should set testsPath on the 'core' source", async () => {
		readFile.mockImplementation( () =>
			Promise.resolve( JSON.stringify( { core: './relative' } ) )
		);
		const config = await readConfig( '.wp-env.json' );
		expect( config.env.development ).toMatchObject( {
			coreSource: {
				type: 'local',
				path: expect.stringMatching( /^\/.*relative$/ ),
				testsPath: expect.stringMatching( /^\/.*tests-relative$/ ),
			},
		} );
		expect( config.env.tests ).toMatchObject( {
			coreSource: {
				type: 'local',
				path: expect.stringMatching( /^\/.*relative$/ ),
				testsPath: expect.stringMatching( /^\/.*tests-relative$/ ),
			},
		} );
	} );

	it( 'should parse GitHub sources', async () => {
		readFile.mockImplementation( () =>
			Promise.resolve(
				JSON.stringify( {
					plugins: [
						'WordPress/gutenberg',
						'WordPress/gutenberg#master',
						'WordPress/gutenberg#5.0',
					],
				} )
			)
		);
		const config = await readConfig( '.wp-env.json' );
		const matchObj = {
			pluginSources: [
				{
					type: 'git',
					url: 'https://github.com/WordPress/gutenberg.git',
					ref: 'master',
					path: expect.stringMatching( /^\/.*gutenberg$/ ),
					basename: 'gutenberg',
				},
				{
					type: 'git',
					url: 'https://github.com/WordPress/gutenberg.git',
					ref: 'master',
					path: expect.stringMatching( /^\/.*gutenberg$/ ),
					basename: 'gutenberg',
				},
				{
					type: 'git',
					url: 'https://github.com/WordPress/gutenberg.git',
					ref: '5.0',
					path: expect.stringMatching( /^\/.*gutenberg$/ ),
					basename: 'gutenberg',
				},
			],
		};
		expect( config.env.tests ).toMatchObject( matchObj );
		expect( config.env.development ).toMatchObject( matchObj );
	} );

	it( 'should parse wordpress.org sources', async () => {
		readFile.mockImplementation( () =>
			Promise.resolve(
				JSON.stringify( {
					plugins: [
						'https://downloads.wordpress.org/plugin/gutenberg.zip',
						'https://downloads.wordpress.org/plugin/gutenberg.8.1.0.zip',
						'https://downloads.wordpress.org/theme/twentytwenty.zip',
						'https://downloads.wordpress.org/theme/twentytwenty.1.3.zip',
					],
				} )
			)
		);
		const config = await readConfig( '.wp-env.json' );
		const matchObj = {
			pluginSources: [
				{
					type: 'zip',
					url: 'https://downloads.wordpress.org/plugin/gutenberg.zip',
					path: expect.stringMatching( /^\/.*gutenberg$/ ),
					basename: 'gutenberg',
				},
				{
					type: 'zip',
					url:
						'https://downloads.wordpress.org/plugin/gutenberg.8.1.0.zip',
					path: expect.stringMatching( /^\/.*gutenberg$/ ),
					basename: 'gutenberg',
				},
				{
					type: 'zip',
					url:
						'https://downloads.wordpress.org/theme/twentytwenty.zip',
					path: expect.stringMatching( /^\/.*twentytwenty$/ ),
					basename: 'twentytwenty',
				},
				{
					type: 'zip',
					url:
						'https://downloads.wordpress.org/theme/twentytwenty.1.3.zip',
					path: expect.stringMatching( /^\/.*twentytwenty$/ ),
					basename: 'twentytwenty',
				},
			],
		};
		expect( config.env.development ).toMatchObject( matchObj );
		expect( config.env.tests ).toMatchObject( matchObj );
	} );

	it( 'should throw a validaton error if there is an unknown source', async () => {
		readFile.mockImplementation( () =>
			Promise.resolve( JSON.stringify( { plugins: [ 'invalid' ] } ) )
		);
		expect.assertions( 2 );
		try {
			await readConfig( '.wp-env.json' );
		} catch ( error ) {
			expect( error ).toBeInstanceOf( ValidationError );
			expect( error.message ).toContain(
				'Invalid or unrecognized source'
			);
		}
	} );

	it( 'should parse mappings into sources', async () => {
		readFile.mockImplementation( () =>
			Promise.resolve(
				JSON.stringify( {
					mappings: {
						test: './relative',
						test2: 'WordPress/gutenberg#master',
					},
				} )
			)
		);
		const config = await readConfig( '.wp-env.json' );
		const matchObj = {
			test: {
				type: 'local',
				path: expect.stringMatching( /^\/.*relative$/ ),
				basename: 'relative',
			},
			test2: {
				type: 'git',
				path: expect.stringMatching( /^\/.*gutenberg$/ ),
				basename: 'gutenberg',
			},
		};
		expect( config.env.development.mappings ).toMatchObject( matchObj );
		expect( config.env.development.mappings ).toMatchObject( matchObj );
	} );

	it( 'should throw a validaton error if there is an invalid mapping', async () => {
		readFile.mockImplementation( () =>
			Promise.resolve( JSON.stringify( { mappings: { test: 'false' } } ) )
		);
		expect.assertions( 2 );
		try {
			await readConfig( '.wp-env.json' );
		} catch ( error ) {
			expect( error ).toBeInstanceOf( ValidationError );
			expect( error.message ).toContain(
				'Invalid or unrecognized source'
			);
		}
	} );

	it( 'throws an error if a mapping is badly formatted', async () => {
		readFile.mockImplementation( () =>
			Promise.resolve(
				JSON.stringify( {
					mappings: { test: null },
				} )
			)
		);
		expect.assertions( 2 );
		try {
			await readConfig( '.wp-env.json' );
		} catch ( error ) {
			expect( error ).toBeInstanceOf( ValidationError );
			expect( error.message ).toContain(
				'Invalid .wp-env.json: "mappings.test" should be a string.'
			);
		}
	} );

	it( 'throws an error if mappings is not an object', async () => {
		readFile.mockImplementation( () =>
			Promise.resolve(
				JSON.stringify( {
					mappings: 'not object',
				} )
			)
		);
		expect.assertions( 2 );
		try {
			await readConfig( '.wp-env.json' );
		} catch ( error ) {
			expect( error ).toBeInstanceOf( ValidationError );
			expect( error.message ).toContain(
				'Invalid .wp-env.json: "mappings" must be an object.'
			);
		}
	} );

	it( 'should return an empty mappings object if none are passed', async () => {
		readFile.mockImplementation( () =>
			Promise.resolve( JSON.stringify( { mappings: {} } ) )
		);
		const config = await readConfig( '.wp-env.json' );
		expect( config.env.development.mappings ).toEqual( {} );
		expect( config.env.tests.mappings ).toEqual( {} );
	} );

	it( 'should throw a validaton error if the ports are not numbers', async () => {
		expect.assertions( 10 );
		await testPortNumberValidation( 'port', 'string' );
		await testPortNumberValidation( 'testsPort', [], 'env.tests.' );
		await testPortNumberValidation( 'port', {} );
		await testPortNumberValidation( 'testsPort', false, 'env.tests.' );
		await testPortNumberValidation( 'port', null );
	} );

	it( 'should throw a validaton error if the ports are the same', async () => {
		expect.assertions( 2 );
		readFile.mockImplementation( () =>
			Promise.resolve( JSON.stringify( { port: 8888, testsPort: 8888 } ) )
		);
		try {
			await readConfig( '.wp-env.json' );
		} catch ( error ) {
			expect( error ).toBeInstanceOf( ValidationError );
			expect( error.message ).toContain(
				'Invalid .wp-env.json: Each port value must be unique.'
			);
		}
	} );

	it( 'should parse custom ports', async () => {
		readFile.mockImplementation( () =>
			Promise.resolve(
				JSON.stringify( {
					port: 1000,
					testsPort: 2000,
				} )
			)
		);
		const config = await readConfig( '.wp-env.json' );
		// Custom port is overriden while testsPort gets the deault value.
		expect( config ).toMatchObject( {
			env: {
				development: {
					port: 1000,
				},
				tests: {
					port: 2000,
				},
			},
		} );
	} );

	it( 'should throw an error if the port number environment variable is invalid', async () => {
		readFile.mockImplementation( () =>
			Promise.resolve( JSON.stringify( {} ) )
		);
		const oldPort = process.env.WP_ENV_PORT;
		process.env.WP_ENV_PORT = 'hello';
		try {
			await readConfig( '.wp-env.json' );
		} catch ( error ) {
			expect( error ).toBeInstanceOf( ValidationError );
			expect( error.message ).toContain(
				'Invalid environment variable: WP_ENV_PORT must be a number.'
			);
		}
		process.env.WP_ENV_PORT = oldPort;
	} );

	it( 'should throw an error if the tests port number environment variable is invalid', async () => {
		readFile.mockImplementation( () =>
			Promise.resolve( JSON.stringify( {} ) )
		);
		const oldPort = process.env.WP_ENV_TESTS_PORT;
		process.env.WP_ENV_TESTS_PORT = 'hello';
		try {
			await readConfig( '.wp-env.json' );
		} catch ( error ) {
			expect( error ).toBeInstanceOf( ValidationError );
			expect( error.message ).toContain(
				'Invalid environment variable: WP_ENV_TESTS_PORT must be a number.'
			);
		}
		process.env.WP_ENV_TESTS_PORT = oldPort;
	} );

	it( 'should use port environment values rather than config values if both are defined', async () => {
		readFile.mockImplementation( () =>
			Promise.resolve(
				JSON.stringify( {
					port: 1000,
					testsPort: 2000,
				} )
			)
		);
		const oldPort = process.env.WP_ENV_PORT;
		const oldTestsPort = process.env.WP_ENV_TESTS_PORT;
		process.env.WP_ENV_PORT = 4000;
		process.env.WP_ENV_TESTS_PORT = 3000;

		const config = await readConfig( '.wp-env.json' );
		expect( config ).toMatchObject( {
			env: {
				development: {
					port: 4000,
				},
				tests: {
					port: 3000,
				},
			},
		} );

		process.env.WP_ENV_PORT = oldPort;
		process.env.WP_ENV_TESTS_PORT = oldTestsPort;
	} );

	it( 'should use 8888 and 8889 as the default port and testsPort values if nothing else is specified', async () => {
		readFile.mockImplementation( () =>
			Promise.resolve( JSON.stringify( {} ) )
		);

		const config = await readConfig( '.wp-env.json' );
		expect( config ).toMatchObject( {
			env: {
				development: {
					port: 8888,
				},
				tests: {
					port: 8889,
				},
			},
		} );
	} );

	it( 'should use the WP_ENV_HOME environment variable only if specified', async () => {
		readFile.mockImplementation( () =>
			Promise.resolve( JSON.stringify( {} ) )
		);
		const oldEnvHome = process.env.WP_ENV_HOME;

		expect.assertions( 2 );

		process.env.WP_ENV_HOME = 'here/is/a/path';
		const configWith = await readConfig( '.wp-env.json' );
		expect(
			configWith.workDirectoryPath.includes( 'here/is/a/path' )
		).toBe( true );

		process.env.WP_ENV_HOME = undefined;
		const configWithout = await readConfig( '.wp-env.json' );
		expect(
			configWithout.workDirectoryPath.includes( 'here/is/a/path' )
		).toBe( false );

		process.env.WP_ENV_HOME = oldEnvHome;
	} );

	it( 'should use the WP_ENV_HOME environment variable on Linux', async () => {
		readFile.mockImplementation( () =>
			Promise.resolve( JSON.stringify( {} ) )
		);
		const oldEnvHome = process.env.WP_ENV_HOME;
		const oldOsPlatform = os.platform;
		os.platform = () => 'linux';

		expect.assertions( 2 );

		process.env.WP_ENV_HOME = 'here/is/a/path';
		const configWith = await readConfig( '.wp-env.json' );
		expect(
			configWith.workDirectoryPath.includes( 'here/is/a/path' )
		).toBe( true );

		process.env.WP_ENV_HOME = undefined;
		const configWithout = await readConfig( '.wp-env.json' );
		expect(
			configWithout.workDirectoryPath.includes( 'here/is/a/path' )
		).toBe( false );

		process.env.WP_ENV_HOME = oldEnvHome;
		os.platform = oldOsPlatform;
	} );

	it( 'should use a non-private folder with Snap-installed Docker', async () => {
		readFile.mockImplementation( () =>
			Promise.resolve( JSON.stringify( {} ) )
		);
		stat.mockReturnValue( Promise.resolve( true ) );

		expect.assertions( 2 );

		const config = await readConfig( '.wp-env.json' );
		expect( config.workDirectoryPath.includes( '.wp-env' ) ).toBe( false );
		expect( config.workDirectoryPath.includes( 'wp-env' ) ).toBe( true );
	} );
} );

/**
 * Tests that readConfig will throw errors when invalid port numbers are passed.
 *
 * @param {string} portName The name of the port to test ('port' or 'testsPort')
 * @param {any}    value    A value which should throw an error.
 * @param {string} envText  Env text which prefixes the error.
 */
async function testPortNumberValidation( portName, value, envText = '' ) {
	readFile.mockImplementation( () =>
		Promise.resolve( JSON.stringify( { [ portName ]: value } ) )
	);
	try {
		await readConfig( '.wp-env.json' );
	} catch ( error ) {
		// Useful for debugging:
		if ( ! ( error instanceof ValidationError ) ) {
			throw error;
		}
		expect( error ).toBeInstanceOf( ValidationError );
		expect( error.message ).toContain(
			`Invalid .wp-env.json: "${ envText }port" must be an integer.`
		);
	}
	jest.clearAllMocks();
}
/* eslint-enable jest/no-try-expect */