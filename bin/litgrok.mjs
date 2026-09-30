#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { constants, copyFileSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMark, terminalMode } from '../.grok/hooks/lit-mark.mjs';
import { installStatusLine, removeStatusLine } from './status-line-config.mjs';

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PAYLOAD_ROOT = join(PACKAGE_ROOT, '.grok');
const INSTALL_MANIFEST_NAME = '.litgrok-install-manifest.json';
const INSTALL_MANIFEST_SCHEMA = 'litgrok.install-manifest/v1';
// Stable ownership identity across npm package renames; never derive this from package.json.
const OWNERSHIP_PACKAGE_ID = 'litgrok-ai';
const SKILL_RENAMES = Object.freeze({
  hyperplan: 'lit-crucible',
  'init-deep': 'lit-init',
  'git-master': 'lit-commit',
  teammode: 'lit-team',
  'remove-ai-slops': 'lit-burnoff',
  'ai-slop-remover': 'lit-burnoff-file',
  'text-naturalization': 'lit-humanizer',
  'lit-korean': 'lit-humanizer',
  'korean-ai-slop-remover': 'lit-humanizer',
  programming: 'lit-code',
});
const VENDOR_RENAMES = Object.freeze({
  '045_scientific-visualization': 'scientific-visualization',
});
const AGENT_RENAMES = Object.freeze({
  'litgrok-prometheus-planner': 'litgrok-planner',
  'litgrok-boulder-executor': 'litgrok-executor',
  'litgrok-oracle-verifier': 'litgrok-verifier',
});

// 0.2.5 was the last release before ownership manifests existed. These are the
// payload hashes changed since that release, so a pristine 0.2.5 install can
// migrate while no manifest exists without treating package-owned files as conflicts.
const PRE_MANIFEST_PAYLOAD_HASHES = Object.freeze({
  'skills/frontend-ui-ux/THIRD-PARTY-NOTICE.txt': 'ca1e7d88104177450ff848296cf9340f5f69aa421c4f215673a72a33c03c927e',
  'skills/frontend-ui-ux/scripts/import-design-intelligence.mjs': '463e28da2cf102b62fd372b4b507f1e716b8ce349db4361e0027a500619b3291',
  'agents/litgrok-korean-prose-editor.md': '4920e7552843025192f846dccf4e455b2bc32a7d14239cfa3fb367b8e87d0474',
  'agents/litgrok-korean-style-analyzer.md': '5d965b2d9fae19de3d18d7230f3ea3a1da5e915d2024371051df3bc24a7c479f',
  'agents/litgrok-librarian-researcher.md': '5abaa80256eb46f93747705f11696894305b04025b74917d8e7d2311b37e97e9',
  'agents/litgrok-meaning-preservation-auditor.md': '42d8a63ffd920f22b5f1945168b10c07d9fdb09ea99d17366aac7b6164bbfad4',
  'agents/litgrok-native-flow-reviewer.md': 'd6e3bf4dcce0ad8648e0bb4849602264ff45212cbdaceaf9195b0a87e3925841',
  'agents/litgrok-polish-orchestrator.md': '4aaeee69ae52ec4ec4dff587296a6206129aea5094445e1441af58a5e13e960f',
  'agents/litgrok-qa-runner.md': 'b2ce6ab2a2258b76c13bd4a4eef4aba3a7f95393054585c4844e298376e4a3e1',
  'agents/litgrok-quality-reviewer.md': 'ed6f2687770f0f31c6821f0ad49d717362807f0bb5f4f27cf4d36be1e7dfd5a2',
  'hooks/deliverable-hedge-guard.json': '65a0008a8c51be203a385f0ca55a5e7eb9e60e487c701c08d6d2407f0a3a1170',
  'hooks/deliverable-hedge-guard.mjs': '78f997d793e94853d1ef9073fbc9dd8b1577fe756d5e8a89d4fc3859d4bde5a9',
  'hooks/record-passive-event.mjs': '9f5bd1d6c8b8e6c0be4cc61cf31f0e26f4f8a41fceb826e88567f22efa2b0090',
  'hooks/session-start.mjs': '5706ccce58340e78e435b9c1fd2224e101872ce1d0f51a9d187feb31b67c3b5d',
  'hooks/stop.mjs': 'c796f02ac3dc99716d0c2f478bf93ec35cd8a9c725de18d12895957ee261b9c3',
  'rules/00-litgrok.md': 'd46d1672e80250c8748458afa9b0fc1a46c2a318d31c4d58ab1ebc3f8f2eb804',
  'skills/autoconference/SKILL.md': '025e9420ed9986b0466a8d660a4ed7f3e2d2243051ed3622be8ca87cbeba9458',
  'skills/autoconference/assets/report_template.md': '73a00032dc143f34f67a97a257f76e7a5acd9365d367e0b27d0c72e439a336ab',
  'skills/autoconference/references/_canonical-corpus/manifest.json': '4554ee4041b73577a844abc27a97db91e941b8412f1888209203251dc1fee500',
  'skills/autoconference/scripts/init_conference.py': 'cb83623c1338b7e3a5be7a7beac7a17b8ae362fc24fbc01d1caff634db290dfc',
  'skills/autoconference/scripts/verify-canonical-corpus.mjs': '4a4afb7dc0b58519a4c521c987cb8998495afc09b89fb87cafb0f1db0047c28d',
  'skills/autoresearch/SKILL.md': 'a0d1b38a332ce2628d866047e0d778273fc99ccfaad691774862d9a0738cf84c',
  'skills/autoresearch/references/_canonical-corpus/manifest.json': '9667f852081d4877c579d14e63c0759ebbe863e4170a9c3d5e6487cdb1f0c323',
  'skills/autoresearch/scripts/init_research.py': 'a5434711928eb4d0487d933df5e1b374f8553140004c6ab8e38fe577ae074d05',
  'skills/autoresearch/scripts/verify-canonical-corpus.mjs': '80a85ed4ba0c168bd7f7abef5754c4089a629975a827b6ddb3f01cd813602274',
  'skills/browser-drive/SKILL.md': '86c43a861be7c530efbff6f000a2bba12aa405153424c089cc94be14ab907945',
  'skills/debugging/references/methodology/02-investigate.md': 'c9d02c7419df3180ae0f66455ff34ee533fa0b928e6541dac30d80bb91b4aa87',
  'skills/deep-interview/SKILL.md': '8fba6a534816f8d58e55469374f6d6de9e61156b90f95197bbb9e94be17930f0',
  'skills/frontend-ui-ux/SKILL.md': 'eb150141ee376401a886ff04ea2dd70284c9ad65e59d8bb0345866addf065711',
  'skills/frontend-ui-ux/references/adaptive-layout.md': 'd01ad4e7a55c30bac4bba4f8af01a174b8774cfff8a872f2c8c4cfc45b605792',
  'skills/frontend-ui-ux/references/brand-and-imagery.md': 'ba428075259c9b1552f3b04ad0f91b9f9f914f71a6e827de1604a5b08e335034',
  'skills/frontend-ui-ux/references/complete-contract.md': '9b098e7030f0979ac7d213b76cdcd133f0c411b91baa275a193720637a5f6059',
  'skills/frontend-ui-ux/references/composition.md': '13692ff243d3779af762a10e1c93c675c57cb2ddb5d9fd9e071650ddd43c9b20',
  'skills/frontend-ui-ux/references/creative-directions.md': 'a8cf8d825e18553b98ae8d0a80b948d1c6842f2d15a36e07b185aa89af9682be',
  'skills/frontend-ui-ux/references/implementation-platforms.md': 'ce660ab433e2ab09e7a682aa245120fe1fec151cad48e5499fdd20d7db53f21e',
  'skills/frontend-ui-ux/references/inclusive-interface.md': 'a66102e8e7c74da9a84a613253082c6a89640410ab3645a8b4198ab32e66fa5a',
  'skills/frontend-ui-ux/references/interaction-motion.md': '58e6e5bfa8c9e741c51ecbc2fafe23794ef437c682c870924571bdd3ae7c9a26',
  'skills/frontend-ui-ux/references/performance-delivery.md': 'c1ddd98f40c851f900597ff1e557021a8d7f6df75b82904b4721afaa5ba80644',
  'skills/frontend-ui-ux/references/product-direction.md': '8e9a082dcff20f7ae80b6f2d280d56cf53bca7837a7e45d0357c62dd98634899',
  'skills/frontend-ui-ux/references/redesign-playbook.md': 'd20f96f7a269a4ec3bc61d40f3c86186aac4a77c9ae58462022cf31729f046d7',
  'skills/frontend-ui-ux/references/system-foundations.md': '020bd17304e604658b27565f710d531cdedc7b5a56db1a537fb94b7caffea394',
  'skills/frontend-ui-ux/references/visual-language.md': 'e7211082a47ef56ad82b87d23e808f4ead64b9264dd347453abb127c0d488711',
  'skills/frontend-ui-ux/references/visual-reconstruction.md': '0564552624bf3fd862c09552933f2e7139f639e485da8a134ec7ab4f7b624573',
  'skills/lit-comprehend/SKILL.md': 'bec52c1a2d8ffcd356a0f253358d08e7a5a0b0735917bb71b6b616d87eb4b105',
  'skills/lit-comprehend/references/artifact-format.md': '8ba41293b8e7277078ffaab6df65130c018575592f20740162b13e59f6295492',
  'skills/lit-comprehend/references/artifact-template.md': '26ac49b02bc32c1aba0e33cb67fc57a6c1d3c846309b49aaf34ac69f13dea925',
  'skills/lit-comprehend/references/honesty-ledger-contract.md': '3c167739feeb88baa5d286116744c35101f516610e0cdd180f27838dab4ae418',
  'skills/lit-comprehend/references/worked-explainer.md': 'c6ecde363a39760632e8c7f296d14ea32df508afebb99c101cc68ee021d0fac4',
  'skills/lit-handoff/SKILL.md': '7152d6399fd778ab3d16e1abad2ec97e2f4be4350cd3993cdde038cc1211dd80',
  'skills/lit-scientific-visualization/SKILL.md': 'ffc3b2ea49dd7e7c4c7d4568f289df294a3a30f953c11039f98aaf6f8fb983ee',
  'skills/lit-scientific-visualization/scripts/verify-canonical-corpus.mjs': 'a1cfe0578195098dc4afc2d25f0d391f38aeaa57cd3970fa7dca51e20cbf929d',
  'skills/litgoal/SKILL.md': 'e3fd76a8f4c91903ab85073b492f3981f76cb17644b840ba22d2a1c5e82178a9',
  'skills/litgrok/SKILL.md': '6ea1fb66d5a1458e182cff5808ccc416487dbbad0341988bcda0f247645081e2',
  'skills/litresearch/SKILL.md': '93cf90ef9706531b7cacbce434a6eea13c3350df3266a25aabfa3149c0d82bf4',
  'skills/litwork/SKILL.md': '771b7cead03c0d1d1e67af82e308ea0980b8ab18474026516798f559048beda7',
  'skills/lsp-setup/SKILL.md': '313ffd924f00a1523905d2588e0812c8edcaec84b114d2d487506bd905e5376d',
  'skills/lsp/SKILL.md': '2e4b1abdd0b03e993b8082ac34adc11de2fe6553f623e4a434b10a20499c4aad',
  'skills/refactor/SKILL.md': '5fd2df1a36eae216f8af4db09e7e7d26231b167907ad19c49465153a1dcadde0',
  'skills/review-work/SKILL.md': 'acfef3ff9c6e243cb9b88169a67e749e27a2e530af09aed07a2d66dd932c3b5d',
  'skills/rules/SKILL.md': 'b880136962faeb3dea93cc42e30f5d3cc461a03fe71f7ff908d4b09170c38c5f',
  'skills/start-work/SKILL.md': 'ddc7357f99c78cd3405c1cb0202f9b13871efbe59f365e9f39727c429791028b',
  'skills/structural-search/SKILL.md': '3bbc13b5d0df58fbae07dd53e7ecbf13f311f12311cc3bd313803d63bd331ee0',
  'skills/visual-qa/references/complete-contract.md': '9562a993b9fc75f8cda5e5f810ff534590f4ace36e696bf60119c0b27ba19cd5',
  'skills/wikify/SKILL.md': 'b21e423139e86f62c5aa6ffb8c8c3dc420c33d311ca07c33fb11aa0d67da6d65',
});
const PRE_MANIFEST_LEGACY_PAYLOAD_HASHES = Object.freeze({
  'agents/litgrok-boulder-executor.md': '7e4d4d8512f2a0a9baf547a8d0bf586427d359f5c22e31fceb424d7b60def7dd',
  'agents/litgrok-oracle-verifier.md': '4bc9a904851c5d37c1bfc6539ec4d52ed63fefa95eecfdba7eaaa9164290324e',
  'agents/litgrok-prometheus-planner.md': 'dd74ec91b0bacd3fdba46799cebd33964bd93957b7d0224a7a2e5627a71cb99a',
  'skills/ai-slop-remover/SKILL.md': 'f3f4bc4e18bd0dd0162e06fbb61d6640489f73a58f7ef31acda78a84a4175486',
  'skills/git-master/SKILL.md': '9593944cedb3c6a50d5ac68df481fe268bfac7824258bc93c52f1add1fa222b1',
  'skills/hyperplan/SKILL.md': '189a57b292dd49bee61747334dcd1771e995defe2e0891fe5e3726dd877785d4',
  'skills/init-deep/SKILL.md': '8255ba3a45dc181e69cdfe6fb85051e39f7fcdf78023856436d99146d730ce45',
  'skills/lit-scientific-visualization/assets/color_palettes.py': 'ffea28da930406ecb11bbeaebfc530dfac40b772827a7653f449cb3b0bb35309',
  'skills/lit-scientific-visualization/assets/nature.mplstyle': '6a7343788bf772b7e1bc813d094f7bafa97c1e5544586e7b76002ad8547229b6',
  'skills/lit-scientific-visualization/assets/presentation.mplstyle': 'e3ee23f0470d7fb07a0be75cd1210e231becfc2f5267aa404e4186aa077a3339',
  'skills/lit-scientific-visualization/assets/publication.mplstyle': '18447af3bc47310d23fc27255413c23d8bbe3ff441463cc54fcecdfacd205bea',
  'skills/lit-scientific-visualization/evals/evals.json': '366dc61b6e042f08f28bf33f2534feea80219d771b84497ec7094b30263e935b',
  'skills/lit-scientific-visualization/references/_canonical-corpus/manifest.json': '9cafbdc5e1259aea053a5bf637e18d034f8e169be74b2c5732fc5bfd30f7c5bd',
  'skills/lit-scientific-visualization/references/color_palettes.md': '0298691c8de8379570488a7b7768663971bc20af1fb05d464c5438d43a21dcfa',
  'skills/lit-scientific-visualization/references/journal_requirements.md': '56fdde590a9d778547dbcb609b77d86f1f31865e803bcecca5d8c4c72b91b3c7',
  'skills/lit-scientific-visualization/references/matplotlib_examples.md': 'c99cd4f83e2452773e9580e2fa0984e61433c7a9b57ca0d2562dc400dfe4f83d',
  'skills/lit-scientific-visualization/references/mdanalysis_martini_visualization.md': 'abcb3c61f1c3984ba9014d9ae197b726d23c1df844dc90988ecc4d8f0e349bfe',
  'skills/lit-scientific-visualization/references/publication_guidelines.md': 'd9f5d0f115872c4c190a11d83432d44635e38ef9f1740db471fcc70f4c91dd2c',
  'skills/lit-scientific-visualization/references/seaborn_for_publications.md': '2da2147ae8974b4b5d16096c1484b982d5d1e5f91113808ebfd12111a0a6597a',
  'skills/lit-scientific-visualization/scripts/figure_export.py': 'b22c7708afaf2a1cfa4f821eb9230d4262f1d52948af7f0815855aa9d0960403',
  'skills/lit-scientific-visualization/scripts/style_presets.py': 'e9d450bd4ab6b11303b02d5029177c8d49466cc597648d12de0ecdb7620f64c4',
  'skills/lit-scientific-visualization/tests/test_figure_export.py': 'b18414369e6721ad93d417914114d71af006248675eb20bb1f4989c48ec9a58e',
  'skills/lit-scientific-visualization/tests/test_style_presets.py': 'ff0e190196480848f1fea2398220038771f386ee7967a0ef122b0dfbca3aed46',
  'skills/programming/SKILL.md': 'ab757ca2e68519a154e61de43d6e423ba74fad808dc2b7694c7157b7cd48d67e',
  'skills/programming/references/go/README.md': 'faedb8ab4e13f4ff03ad3497f3ed44df1b5b71463b741a58ee61b60ddb68b188',
  'skills/programming/references/go/backend-stack.md': '444cdf304c5a45d096f44214e74184235ce909dfe49fffd27483175782393ea0',
  'skills/programming/references/go/bootstrap.md': '6fefd389c7565537a19c28477cc4f26c8902ffa0f6a61b58acac0beab10373c6',
  'skills/programming/references/go/bubbletea-v2.md': '1d96b56df1e07cc1a2e14ec5d314361aedcb935eb5a41d74357ac9c8de4bef9e',
  'skills/programming/references/go/cobra-stack.md': '80b95001f2fa38f630579a4475f165ff97a47bd9d3339797edd4841d4d6c1858',
  'skills/programming/references/go/concurrency.md': '901d041ca3dab96d3720f8c08b72e4c7ffb5a9cad8ff0177eec1b7622aa8d8ae',
  'skills/programming/references/go/data-modeling.md': '9dac5a3debf5519053e36472fe5577d5f2f9e302d00a1f40a43f94589a525564',
  'skills/programming/references/go/error-handling.md': 'fb67e9b98d7f07db2fc49dc310bab93102520e12592c733e880b6d8aa0d2958f',
  'skills/programming/references/go/golangci-strict.md': '63873c768df6215e6b9c4ea86c99e434a64b4749030e4fef2e7fe9aaa3ed2661',
  'skills/programming/references/go/grpc-connect.md': '0b2bab192ace681729954c05fba4c2d622019a69544c5628011cc6e22cb5c831',
  'skills/programming/references/go/libraries.md': '4d825b2316eaba70ecc0836eb50a25a8ac496da4ce029be85ddddd9f15de663c',
  'skills/programming/references/go/one-liners.md': 'ff354a8700a9987ad21f4fb0cf4d5695857cae093c42358bc3eef13826f8ddfb',
  'skills/programming/references/go/sqlc-pgx.md': '26243d7b26e3ffadce87b4f78739e6582c69d5c144af89f2ef55c076b5e1b399',
  'skills/programming/references/go/testing.md': 'e9014b01d8cf3967ae2b022491a95f7955c3ace2624fbd8cbb1630921499dff9',
  'skills/programming/references/go/type-patterns.md': '87d930ed6cdc57b3c20aae802679a4f419f77b5fcf4a630a6973271cc62545c7',
  'skills/programming/references/permission-sandbox-matrix.md': '33bed4d151af3295afef21f234577de6656ce0efd54c0ee39faa6f11a83b1287',
  'skills/programming/references/python/README.md': '23ef4282a10fce99de314ddc3c8d93eca79c92f256c87cf8caa54a2ee703e738',
  'skills/programming/references/python/async-anyio.md': 'ccb43fa3c54aed4f51e1f74e93912bdf224651551b3cf82ee0b07cee79fe8b19',
  'skills/programming/references/python/data-modeling.md': 'eed848d993a4bbd30dca44fba0599a359e64596a18e305f06c5a76f4f65d9ebf',
  'skills/programming/references/python/data-processing.md': '1cee6ea8692c213f244070f69682b00b25ab763d64cd114c41b7ac84c7865ed9',
  'skills/programming/references/python/error-handling.md': 'c8a31325999441f1890e9a35bcef02a316a930bf36bba992e376e6c6a742dcd5',
  'skills/programming/references/python/fastapi-stack.md': '56726249ec0ee805ef900ecdfa2b5939f829b06506aa2cb82ab9924d846ffa44',
  'skills/programming/references/python/httpx2-optimization.md': '68c6c96802ee3f5c66e948beff411a7bbb33c7f68de79c4b2ee9349e035dfa82',
  'skills/programming/references/python/libraries.md': '85847a200b8c0a509008662dae1b4f4dbd3934bac490e61097bf986f83c8f464',
  'skills/programming/references/python/one-liners.md': '17b459cfadbc7e81d2d196d2251191ee8f3b8e97f668cb61f5b02d3cf736fbd1',
  'skills/programming/references/python/orjson-stack.md': '5b4ad8732b2192542ed6ea603829635aba98a0449758fd572f172737b2a19792',
  'skills/programming/references/python/pydantic-ai.md': '453f83fed8a89114870177c31d5f4cf45838239087c72de3f5daf9c225eab9e1',
  'skills/programming/references/python/pyproject-strict.md': '655eb106a165d3730d656a9689ac98a00abf7d32cc89f2decaf33ddf43ac0e45',
  'skills/programming/references/python/textual-tui.md': 'bf59c001a76b30777882b2c729321d809a2a81bf75b720e72da1c38a3e7708d9',
  'skills/programming/references/python/type-patterns.md': '4fa0bf3c7e82c6a7141c54aac9e1703cd9ce86122903dbe2fe00700930ca4626',
  'skills/programming/references/rust-ub/README.md': '25300ebe1a467f47695959b00964ded8c560e51bb5d92dffe178f9d3f24b87a9',
  'skills/programming/references/rust-ub/miri-sanitizers-loom.md': 'b3b56208978286dd975440fa1f28d01b9ed05b23d33a1faaa904e62ca310c4e8',
  'skills/programming/references/rust-ub/ub-taxonomy.md': '7c0b369732920f6e59e67fa2f7a9a10fa4ba5b0a23b95ddd1aa2c4011a661326',
  'skills/programming/references/rust/README.md': '7502ee277c86df00388ea7cdbc5b54fc743d4eacab8b4015cd00ad0483ead727',
  'skills/programming/references/rust/async-tokio.md': '48e54d0b4be71fe1765e9bc62e0073a767abd966e29d4b456ae1326d0dc7b760',
  'skills/programming/references/rust/axum-stack.md': '54500cdf3981235b6af178ec4868a8a320087fe18b0a6104c9f462091b1b081b',
  'skills/programming/references/rust/cargo-strict.md': 'f156787df0f8ec551495a247b04d937d22d02a3d23af93599cb05a73ec51fdbf',
  'skills/programming/references/rust/clap-stack.md': '28a1fca06a892686b001f15a467c98b8ec55ae2bae93afbb55447919084158f4',
  'skills/programming/references/rust/concurrency.md': 'd8043493eaf8572b4fd7899c46041bad39f6e321537d2fb8a533be919a01f04d',
  'skills/programming/references/rust/libraries.md': 'a45ff769535abb54a486a019d3a38389e4be814425635801ab13a4f1cd787eac',
  'skills/programming/references/rust/one-liners.md': 'b0cfffa76da01016c933d6d548f3d621546710a6a2d4d609fb185647b74cc455',
  'skills/programming/references/rust/proptest-insta.md': 'be787a4e174f55062931b70c53027a6c46423e3473608b315ac800b52325c3d1',
  'skills/programming/references/rust/type-state.md': '3dc21686fa0b2f1cb0c6206e38b800aa8b9ecf482d02faa9c1c4fd925da051e5',
  'skills/programming/references/rust/unsafe-discipline.md': '81d1596842a6295a03f0f23c06307b8b0f3d45d33cedd355a499d8185bafe934',
  'skills/programming/references/rust/zero-cost-safety.md': 'a03623f9e0d80cdb5c2addddb97b27932c84adb5232b2d659442ba5e74e37bbb',
  'skills/programming/references/tool-boundaries.md': 'a153462ad867dfacff3e81633afc9ed39b05320bce42814f060264bb9f5fef89',
  'skills/programming/references/typescript/README.md': 'c54f997b70659b574ce805196aefd9978354da5f73d5fdb6defbce1abf11041e',
  'skills/programming/references/typescript/backend-hono.md': 'e6999b7012bfe38c66aebcdfc2cca7be57746a209873b15e887b716c7e2f3f18',
  'skills/programming/references/typescript/bootstrap.md': '4e61ffdc1a5df3637a14766a846b12a2d57943d6b002081f53c8cbd6d679303e',
  'skills/programming/references/typescript/data-modeling.md': '14022cca137f1f92e81aa21b3ad9702ead535fccda8bf4f760235195a288c627',
  'skills/programming/references/typescript/error-handling.md': '5d99ea45d454723b1d8292357a7a20b434801101336863df89e000c67bf1e807',
  'skills/programming/references/typescript/tsconfig-strict.md': 'e844903aa4dcf9c5e45592eccbbf04d6146c602c70067c72be74f523b0e2134d',
  'skills/programming/references/typescript/type-patterns.md': 'a21e27706f5d1e60be8f37d2d47949d0759158c999c4a08628f5f925b184d946',
  'skills/programming/references/worked-cases.md': 'ccb6fb8011cda2391d73c4f85ffc3b8038486d77134b986b046d1f62a2f7a9d2',
  'skills/remove-ai-slops/SKILL.md': 'db2f9e91dfd70a2077a091d1c422cba9f6d576af58868df4279d0e7542c29380',
  'skills/skill-observer/SKILL.md': '1edf489673d958b3a7c60c5e1a036498510a02859dcf32e68a6d50b21f2fa344',
  'skills/skill-observer/references/review-contract.md': 'f55dc8334f3b8d8498c84d57725fa03af8fbd689b2dd7cce25e49931629ee54f',
  'skills/skill-observer/scripts/curator.mjs': '07f48d2160ba64584acd17ae9bd55efd6272546722576c288725b8850e3f0455',
  'skills/skill-observer/scripts/review.mjs': '5b79fedae7f7c4d2b6d898717ae427bae1bd6d2c7f9f4bbc2f410f86468f7691',
  'skills/skill-observer/scripts/skill-loop.mjs': '3f3f5265928c0d71175b0f23f71b836d1dc05e7efba407bfdc2d263c6aaed0ce',
  'skills/skill-observer/scripts/validate-skills.mjs': 'cd71e88c45e57869114305f048257f3da7ec1dfa66f70d9529314defb5fa1a97',
  'skills/teammode/SKILL.md': '23db7152e2ce65cb5f7c52455d6cbd122485bb0fdb13813a8a54b824e8e44f08',
  'skills/teammode/references/explore-packet.md': 'c419c1c84783ddfae272e378c4f7e623ec4fbb437168d2d5cb8436baf4c14e30',
  'skills/teammode/references/general-purpose-packet.md': '45ad9cf82157563ebb20af360bb0b09d7afd7aa0fe114a91816523475ebdc88c',
  'skills/teammode/references/plan-packet.md': '68e292f9a6dc64f7e87a45417d5f92688aac9c2ffb7b519f9e2cab10b5ef4759',
  'skills/text-naturalization/SKILL.md': 'aa1ff8f68ab0bf71cb47818b536c4a2934da65adb413ee43ec5839b540b2df8e',
  'skills/lit-korean/SKILL.md': 'dc2e4b0ea2ff6acca904f05767a62448387571e4183a615d5e53b230704ee828',
});
const USAGE = 'Usage: litgrok [install|uninstall] [--user|--project] [--status-line] [--dry-run] [--no-color] [--yes]\n       litgrok auto-handoff on [percent]|off|status\n       litgrok-ai motion-runtime install|status\nTypographic-motion engine adapted from mexicat/pdoom-video (MIT, Giacomo Magnanini), commit ca251e3.\n';
const BRAILLE_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_INTERVAL_MS = 80;
const CLEAR_LINE = '\r\u001b[2K';

function parseInstall(args) {
  const remaining = [...args];
  let command = 'install';
  if (['install', 'uninstall'].includes(remaining[0])) command = remaining.shift();
  if (remaining.some((argument) => !['--user', '--project', '--status-line', '--dry-run', '--no-color', '--yes'].includes(argument))) return null;
  if (remaining.includes('--user') && remaining.includes('--project')) return null;
  if (remaining.includes('--status-line') && (command !== 'install' || !remaining.includes('--user'))) return null;
  return {
    command,
    dryRun: remaining.includes('--dry-run'),
    noColor: remaining.includes('--no-color'),
    yes: remaining.includes('--yes'),
    statusLine: remaining.includes('--status-line'),
    scope: remaining.includes('--user') ? 'user' : 'project',
  };
}

function packageVersion() {
  try {
    const version = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')).version;
    return typeof version === 'string' && version.length > 0 ? version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function paint(value, code, enabled) {
  return enabled ? `\u001b[${code}m${value}\u001b[0m` : value;
}

function elapsedSince(start) {
  return `${(Number(process.hrtime.bigint() - start) / 1e6).toFixed(1)}ms`;
}

function scopeDescription(options, root) {
  const alternateFlag = options.scope === 'project' ? '--user' : '--project';
  const alternateScope = options.scope === 'project' ? 'user' : 'project';
  return `${options.scope} scope → ${root} (use ${alternateFlag} for ${alternateScope} scope)`;
}

function printInstallFrame(stdout, options, env, fileCount, root) {
  const colors = !options.noColor && !options.dryRun && terminalMode({ env, isTTY: stdout.isTTY }) !== 'none';
  const yellow = colors ? '\u001b[38;2;250;204;21m' : '';
  const reset = colors ? '\u001b[0m' : '';
  const rule = `  ${'━'.repeat(46)}`;
  const payloadLabel = Number.isInteger(fileCount) ? `${fileCount} files · byte-identical copies only` : 'packaged .grok tree · byte-identical copies only';
  stdout.write(`${rule}\n`);
  stdout.write('\n');
  const wordmarkRows = renderMark({ size: 'banner', productName: `grok v${packageVersion()}`, env, isTTY: stdout.isTTY, args: options.dryRun || options.noColor ? ['--no-color'] : [] });
  stdout.write(`${wordmarkRows.map((row) => `   ${row}`).join('\n')}\n`);
  stdout.write('       Grok Build skills, project rules, and hooks\n');
  stdout.write('\n');
  stdout.write(`${rule}\n`);
  stdout.write(`  ╭─ ${options.command.toUpperCase()}\n`);
  stdout.write(`  │ ${yellow}01${reset} · Scope      ${scopeDescription(options, root)}\n`);
  stdout.write(`  │ ${yellow}02${reset} · Payload    ${payloadLabel}\n`);
  stdout.write('  ╰─ whole packaged .grok tree, byte-identical copies only\n');
  stdout.write('  ╭─ MODEL ROUTE\n');
  stdout.write('  │ Model selection: host-owned\n');
  stdout.write('  ╰─ Grok Build owns model and effort; the installer writes no model keys\n');
  return colors;
}

function statusMark(status, colors) {
  if (status === 'ok') return paint('✓', '38;2;80;200;80', colors);
  if (status === 'failed') return paint('✗', '38;2;230;60;60', colors);
  return colors ? paint('○', '38;2;148;163;184', true) : '[skip]';
}

class InstallProgress {
  constructor(stdout, colors) {
    this.stdout = stdout;
    this.colors = colors;
    this.timer = null;
    this.frameIndex = 0;
    this.active = false;
    this.closed = false;
  }

  open() {
    this.stdout.write('  ╭─ INSTALL STEPS\n');
  }

  start(label) {
    this.clearTimer();
    this.active = true;
    this.frameIndex = 0;
    this.label = label;
    if (!this.colors) return;
    this.render();
    this.timer = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % BRAILLE_FRAMES.length;
      this.render();
    }, SPINNER_INTERVAL_MS);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  finish(status, label, detail, elapsed) {
    this.clearTimer();
    const suffix = detail ? ` · ${detail}` : '';
    const line = `  │ ${statusMark(status, this.colors)} ${label}${suffix} · ${elapsed}`;
    this.stdout.write(this.colors && this.active ? `${CLEAR_LINE}${line}\n` : `${line}\n`);
    this.active = false;
  }

  close() {
    this.clearTimer();
    if (this.closed) return;
    this.stdout.write('  ╰─\n');
    this.closed = true;
  }

  render() {
    const frame = paint(BRAILLE_FRAMES[this.frameIndex] ?? BRAILLE_FRAMES[0], '38;2;250;204;21', this.colors);
    this.stdout.write(`${CLEAR_LINE}  │ ${frame} ${this.label}`);
  }

  clearTimer() {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}

function runStep(progress, label, operation) {
  const started = process.hrtime.bigint();
  progress.start(label);
  try {
    const result = operation();
    progress.finish('ok', label, result.detail ?? '', elapsedSince(started));
    return result.value;
  } catch (error) {
    progress.finish('failed', label, error instanceof Error ? error.message : String(error), elapsedSince(started));
    throw error;
  }
}

function skipStep(progress, label, detail) {
  const started = process.hrtime.bigint();
  progress.finish('skipped', label, detail, elapsedSince(started));
}

function receiptCard(options, root, colors, { status, written, current }) {
  const statusColor = status === 'Ready' || status === 'Already current' || status === 'Removed' ? '38;2;80;200;80' : '38;2;230;60;60';
  const titleColor = status === 'Failed' ? '38;2;230;60;60' : '38;2;255;99;55';
  return [
    '',
    `  ${paint('╭─ INSTALL RECEIPT', titleColor, colors)}`,
    `  │ Status: ${paint(status, statusColor, colors)}`,
    `  │ Scope: ${scopeDescription(options, root)}`,
    `  │ Written vs already-current: ${written} written · ${current} already-current`,
    '  │ Model route: host-owned; the installer writes no model keys',
    '  │ Model picker: host limit — Grok Build owns session selection; no model keys are written',
    '  │ Output styles: host limit — Grok Build exposes no output-style selector; the installer writes no style keys',
    '  │ Hooks: project hooks require trust from a Git project root',
    '  │ Trust: use /hooks-trust or, on Grok Build 1.0.13, grok --trust inspect --json',
    '  │ Installer never runs git init or changes trust',
    '  │ Motion runtime: install stays copy-only; pre-warm lit-typographic-motion with litgrok-ai motion-runtime install',
    '  │ Next: restart Grok Build',
    `  ${paint('╰─', titleColor, colors)}`,
    '',
  ].join('\n');
}

function failureCard(options, root, colors, step, message, { showHookTrust = true } = {}) {
  return [
    '',
    `  ${paint('╭─ INSTALL FAILED', '38;2;230;60;60', colors)}`,
    `  │ Status: ${paint('Failed', '38;2;230;60;60', colors)}`,
    `  │ Scope: ${scopeDescription(options, root)}`,
    `  │ Step: ${step}`,
    `  │ Reason: ${message}`,
    ...(showHookTrust ? [
      '  │ Hooks: project hooks require trust from a Git project root',
      '  │ Trust: use /hooks-trust or, on Grok Build 1.0.13, grok --trust inspect --json',
      '  │ Installer never runs git init or changes trust',
    ] : []),
    '  │ Next: resolve the issue and rerun the install',
    `  ${paint('╰─', '38;2;230;60;60', colors)}`,
    '',
  ].join('\n');
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

function reportFailure(error, { stderr, stdout, options, root, colors, step }) {
  const lines = Array.isArray(error?.stderrLines) ? error.stderrLines : [`litgrok: ${errorText(error)}`];
  for (const line of lines) stderr.write(`${line}\n`);
  stdout.write(failureCard(options, root, colors, error?.step ?? step, errorText(error), {
    showHookTrust: error?.legacyOwnershipConflict !== true,
  }));
}

function normalizedRelativePath(relativePath) {
  return relativePath.split(sep).join('/');
}

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function ownershipManifestFailure(reason) {
  const message = `Refusing to use ${INSTALL_MANIFEST_NAME}: ${reason}`;
  const error = new Error(message);
  error.step = 'OWNERSHIP';
  error.stderrLines = [message];
  return error;
}

function ownershipManifestPath(root) {
  return join(root, INSTALL_MANIFEST_NAME);
}

function readOwnershipManifest(root) {
  const target = ownershipManifestPath(root);
  let stat;
  try {
    stat = lstatSync(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isFile()) throw ownershipManifestFailure('path is not a regular file');

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(target, 'utf8'));
  } catch {
    throw ownershipManifestFailure('file is not valid JSON');
  }
  if (
    !parsed ||
    parsed.schema !== INSTALL_MANIFEST_SCHEMA ||
    parsed.package !== OWNERSHIP_PACKAGE_ID ||
    typeof parsed.version !== 'string' ||
    parsed.version.length === 0 ||
    !parsed.files ||
    Array.isArray(parsed.files) ||
    typeof parsed.files !== 'object'
  ) {
    throw ownershipManifestFailure('schema is invalid');
  }

  const hashes = new Map();
  for (const [relativePath, hash] of Object.entries(parsed.files)) {
    const segments = relativePath.split('/');
    if (
      relativePath.length === 0 ||
      relativePath.startsWith('/') ||
      relativePath.includes('\\') ||
      segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')
    ) {
      throw ownershipManifestFailure(`path is invalid: ${relativePath}`);
    }
    if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/u.test(hash)) {
      throw ownershipManifestFailure(`hash is invalid: ${relativePath}`);
    }
    hashes.set(relativePath, hash);
  }
  return { path: target, hashes };
}

function targetState(source, target, relativePath, manifest) {
  try {
    const targetStat = lstatSync(target);
    if (!targetStat.isFile()) return 'conflict';
    const targetHash = sha256File(target);
    if (targetHash === sha256File(source)) return 'current';
    const previousHash = manifest?.hashes.get(normalizedRelativePath(relativePath)) ??
      (manifest === null ? PRE_MANIFEST_PAYLOAD_HASHES[normalizedRelativePath(relativePath)] : undefined);
    return targetHash === previousHash ? 'owned' : 'conflict';
  } catch (error) {
    if (error?.code === 'ENOENT') return 'missing';
    throw error;
  }
}

function legacyTargetState(root, relativePath, expectedHash) {
  const target = join(root, relativePath);
  let ancestor = dirname(target);
  while (ancestor !== root) {
    try {
      const ancestorStat = lstatSync(ancestor);
      if (ancestorStat.isSymbolicLink() || !ancestorStat.isDirectory()) return 'conflict';
    } catch (error) {
      if (error?.code === 'ENOENT') break;
      throw error;
    }
    ancestor = dirname(ancestor);
  }

  try {
    const targetStat = lstatSync(target);
    if (!targetStat.isFile()) return 'conflict';
    return sha256File(target) === expectedHash ? 'owned' : 'conflict';
  } catch (error) {
    if (error?.code === 'ENOENT') return 'missing';
    throw error;
  }
}

function removeLegacyFiles(entries) {
  let removed = 0;
  for (const entry of entries) {
    const state = legacyTargetState(entry.root, entry.relativePath, entry.expectedHash);
    if (state === 'missing') continue;
    if (state !== 'owned') throw new Error(`Refusing to remove different existing file: ${entry.target}`);
    unlinkSync(entry.target);
    removed += 1;
  }
  return removed;
}

function retiredPayload(root, files, manifest) {
  const currentPaths = new Set(files.map(({ relativePath }) => normalizedRelativePath(relativePath)));
  const skillRoots = Object.entries(SKILL_RENAMES)
    .filter(([, name]) => currentPaths.has(`skills/${name}/SKILL.md`))
    .map(([old]) => `skills/${old}`);
  const agentPaths = Object.entries(AGENT_RENAMES)
    .filter(([, name]) => currentPaths.has(`agents/${name}.md`))
    .map(([old]) => `agents/${old}.md`);
  const vendorRoots = Object.entries(VENDOR_RENAMES)
    .filter(([, name]) => [...currentPaths].some((path) => path.startsWith(`vendor/${name}/`)))
    .map(([old]) => `vendor/${old}`);
  const retiredPath = (path) => skillRoots.some((directory) => path.startsWith(`${directory}/`))
    || vendorRoots.some((directory) => path.startsWith(`${directory}/`))
    || agentPaths.includes(path) || Object.hasOwn(PRE_MANIFEST_LEGACY_PAYLOAD_HASHES, path);
  const previous = manifest?.hashes ?? new Map(Object.entries(PRE_MANIFEST_LEGACY_PAYLOAD_HASHES));
  const hashes = new Map([...previous].filter(([path]) => !currentPaths.has(path) && retiredPath(path)));
  for (const path of agentPaths) if (!hashes.has(path)) hashes.set(path, undefined);
  const preservableHumanizerRoots = new Set(['skills/lit-korean', 'skills/text-naturalization', 'skills/korean-ai-slop-remover']);
  const preservedSkills = [];
  function hasUserChanges(path) {
    const target = join(root, path);
    let stat;
    try { stat = lstatSync(target); } catch (error) {
      if (error?.code === 'ENOENT') return false;
      throw error;
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw ownershipManifestFailure(`Refusing unsafe retired skill directory: ${target}`);
    const children = readdirSync(target, { withFileTypes: true });
    if (children.length === 0) return true;
    let changed = false;
    for (const entry of children) {
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory()) changed = hasUserChanges(child) || changed;
      else if (!entry.isFile()) throw ownershipManifestFailure(`Refusing unsafe retired skill entry: ${join(root, child)}`);
      else {
        const expected = previous.get(child);
        if (!expected || legacyTargetState(root, child, expected) !== 'owned') changed = true;
      }
    }
    return changed;
  }
  for (const path of skillRoots) {
    if (preservableHumanizerRoots.has(path) && hasUserChanges(path)) preservedSkills.push(path);
  }
  const directories = [];
  const retiredSkillRoots = new Set(
    [...hashes.keys()]
      .filter((path) => path.startsWith('skills/'))
      .map((path) => path.split('/').slice(0, 2).join('/'))
      .filter((path) => !currentPaths.has(`${path}/SKILL.md`)),
  );

  function visit(path) {
    const target = join(root, path);
    let stat;
    try { stat = lstatSync(target); } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    if (stat.isSymbolicLink() || !stat.isDirectory() || ![...previous.keys()].some((key) => key.startsWith(`${path}/`))) {
      throw ownershipManifestFailure(`Refusing unowned or unsafe retired skill directory: ${target}`);
    }
    const children = readdirSync(target, { withFileTypes: true });
    if (manifest === null && children.length === 0) {
      throw ownershipManifestFailure(`Refusing unowned empty retired skill directory: ${target}`);
    }
    for (const entry of children) {
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory()) visit(child);
      else if (!hashes.has(child)) hashes.set(child, undefined);
    }
    directories.push(target);
  }
  for (const path of new Set([...skillRoots, ...retiredSkillRoots])) {
    if (!preservedSkills.includes(path)) visit(path);
  }
  for (const path of vendorRoots) visit(path);
  const entries = [...hashes]
    .filter(([path]) => !preservedSkills.some((directory) => path.startsWith(`${directory}/`)))
    .map(([relativePath, expectedHash]) => ({ root, relativePath, expectedHash, target: join(root, relativePath) }));
  return { entries, directories, preservedSkills: preservedSkills.map((path) => join(root, path)) };
}

function removeRetiredDirectories(directories) {
  for (const directory of directories) {
    const stat = lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Refusing unsafe retired skill directory: ${directory}`);
    // rmdir refuses unexpected contents; never recursively delete an old skill.
    rmdirSync(directory);
  }
}

function payloadDirectories(root, files) {
  const directories = new Set();
  for (const { target } of files) {
    let directory = dirname(target);
    while (directory !== root && directory.startsWith(`${root}${sep}`)) {
      directories.add(directory);
      directory = dirname(directory);
    }
  }
  // Deepest first, so a parent only empties out after its children are gone.
  return [...directories].sort((left, right) => right.length - left.length);
}

function removeEmptyPayloadDirectories(directories) {
  for (const directory of directories) {
    let stat;
    try {
      stat = lstatSync(directory);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) continue;
    try {
      // rmdir refuses non-empty contents; a user file left in a payload directory keeps it.
      rmdirSync(directory);
    } catch (error) {
      if (error?.code === 'ENOTEMPTY' || error?.code === 'ENOTDIR') continue;
      throw error;
    }
  }
}

function manifestContent(files) {
  const hashes = Object.fromEntries(
    files
      .map(({ relativePath, source }) => [normalizedRelativePath(relativePath), sha256File(source)])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  return `${JSON.stringify({
    schema: INSTALL_MANIFEST_SCHEMA,
    package: OWNERSHIP_PACKAGE_ID,
    version: packageVersion(),
    files: hashes,
  }, null, 2)}\n`;
}

function writeOwnershipManifest(root, files, previousManifest) {
  const target = ownershipManifestPath(root);
  const content = manifestContent(files);
  let existing;
  try {
    const stat = lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isFile()) throw ownershipManifestFailure('path is not a regular file');
    existing = readFileSync(target, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  if (existing === content) return false;
  if (previousManifest === null && existing !== undefined) {
    throw ownershipManifestFailure('path appeared during installation');
  }

  const temporary = join(root, `.${basename(target)}.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, content, { flag: 'wx', mode: 0o600 });
    renameSync(temporary, target);
  } finally {
    try {
      unlinkSync(temporary);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return true;
}

function replaceOwnedFile(source, target) {
  const temporary = join(dirname(target), `.${basename(target)}.${randomUUID()}.tmp`);
  try {
    copyFileSync(source, temporary, constants.COPYFILE_EXCL);
    renameSync(temporary, target);
  } finally {
    try {
      unlinkSync(temporary);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

function removeOwnershipManifest(root, previousManifest) {
  if (previousManifest === null) return;
  const target = ownershipManifestPath(root);
  try {
    const stat = lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isFile()) throw ownershipManifestFailure('path is not a regular file');
    unlinkSync(target);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function discoverPayloadFiles(root = PAYLOAD_ROOT) {
  const files = [];

  function visit(directory) {
    const directoryStat = lstatSync(directory);
    if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
      throw new Error(`invalid payload directory: ${relative(PACKAGE_ROOT, directory)}`);
    }

    const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const source = join(directory, entry.name);
      const sourceStat = lstatSync(source);
      if (sourceStat.isSymbolicLink()) throw new Error(`symbolic link in payload: ${relative(PACKAGE_ROOT, source)}`);
      if (sourceStat.isDirectory()) {
        visit(source);
      } else if (sourceStat.isFile()) {
        files.push({ relativePath: relative(root, source), source });
      } else {
        throw new Error(`non-file payload entry: ${relative(PACKAGE_ROOT, source)}`);
      }
    }
  }

  visit(root);
  if (files.length === 0) throw new Error('packaged .grok payload is empty');
  return files;
}

function unsafeInstallAncestor(root, files) {
  const candidates = new Set([root]);
  for (const { target } of files) {
    let candidate = dirname(target);
    while (candidate !== root) {
      candidates.add(candidate);
      candidate = dirname(candidate);
    }
  }

  for (const candidate of [...candidates].sort((left, right) => left.length - right.length || left.localeCompare(right))) {
    try {
      const candidateStat = lstatSync(candidate);
      if (candidateStat.isSymbolicLink()) return { path: candidate, reason: 'symbolic link' };
      if (!candidateStat.isDirectory()) return { path: candidate, reason: 'non-directory path' };
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return null;
}

export async function run(args, context = {}) {
  if (args[0] === 'motion-runtime') {
    const { runMotionRuntime } = await import('../.grok/skills/lit-typographic-motion/scripts/prewarm.mjs');
    return runMotionRuntime(args.slice(1), { env: context.env ?? process.env, stdout: context.stdout ?? process.stdout, stderr: context.stderr ?? process.stderr });
  }
  if (args[0] === 'auto-handoff') {
    const { runAutoHandoff } = await import('../.grok/hooks/auto-handoff.mjs');
    return runAutoHandoff(args.slice(1), { env: context.env ?? process.env, stdout: context.stdout ?? process.stdout, stderr: context.stderr ?? process.stderr, cwd: context.cwd ?? process.cwd() });
  }
  const env = context.env ?? process.env;
  const stdin = context.stdin ?? process.stdin;
  const stdout = context.stdout ?? process.stdout;
  const stderr = context.stderr ?? process.stderr;
  const cwd = context.cwd ?? process.cwd();
  if (args.some((arg) => arg === '--help' || arg === '-h') && args.every((arg) => ['--help', '-h', '--no-color'].includes(arg))) {
    stdout.write(`${renderMark({ size: 'banner', productName: `grok v${packageVersion()}`, env, isTTY: stdout.isTTY, args }).join('\n')}\n\n${USAGE}`);
    return 0;
  }
  const options = parseInstall(args);
  if (!options) {
    stderr.write(USAGE);
    return 1;
  }

  const home = env.HOME || env.USERPROFILE || homedir();
  const root = join(options.scope === 'project' ? cwd : home, '.grok');
  const displayRoot = resolve(root);
  const payloadStarted = process.hrtime.bigint();
  let discoveredPayload;
  let payloadError;
  try {
    discoveredPayload = discoverPayloadFiles();
  } catch (error) {
    payloadError = error;
  }

  function filesFromPayload(discovered) {
    return discovered.map(({ relativePath, source }) => ({
      relativePath,
      source,
      target: join(root, relativePath),
    }));
  }

  function projectHooksIncluded(files) {
    return options.command === 'install' && options.scope === 'project' && files.some(({ relativePath }) => relativePath.split(sep)[0] === 'hooks');
  }

  function printHookTrustRequirement(files) {
    if (projectHooksIncluded(files)) stdout.write('Project hooks require a trusted Git project root: use /hooks-trust or, on Grok Build 1.0.13, grok --trust inspect --json; the installer never runs git init or changes trust.\n');
  }

  const files = discoveredPayload ? filesFromPayload(discoveredPayload) : null;
  const payloadElapsed = payloadError ? null : elapsedSince(payloadStarted);
  const colors = printInstallFrame(stdout, options, env, files?.length, displayRoot);

  if (payloadError) {
    reportFailure(payloadError, { stderr, stdout, options, root: displayRoot, colors, step: 'PAYLOAD' });
    return 1;
  }

  const reasons = [];
  if (options.dryRun) reasons.push('DRY RUN');
  if (options.noColor || Object.hasOwn(env, 'NO_COLOR')) reasons.push('NO COLOR');
  // --yes accepts a non-TTY stdin/stdout, but never overrides CI: CI stays a forced preview.
  if (Object.hasOwn(env, 'CI') || (!options.yes && (!stdin.isTTY || !stdout.isTTY))) reasons.push('NON-INTERACTIVE');

  if (reasons.length > 0) {
    stdout.write(`${reasons.join(' / ')} — no files written\n`);
    for (const { target } of files) stdout.write(`would ${options.command} ${target}\n`);
    if (options.statusLine) stdout.write(`would configure user status line ${join(root, 'config.toml')}\n`);
    printHookTrustRequirement(files);
    return 0;
  }

  const progress = new InstallProgress(stdout, colors);
  progress.open();
  let step = 'PAYLOAD';
  try {
    progress.finish('ok', 'PAYLOAD', `${files.length} files discovered`, payloadElapsed);

    step = 'SAFETY';
    runStep(progress, 'SAFETY', () => {
      const unsafe = unsafeInstallAncestor(root, files);
      if (unsafe) {
        const message = `Refusing ${unsafe.reason} in install path: ${unsafe.path}`;
        const error = new Error(message);
        error.step = 'SAFETY';
        error.stderrLines = [message];
        throw error;
      }
      return { value: null, detail: 'install path clear' };
    });

    step = 'OWNERSHIP';
    const states = runStep(progress, 'OWNERSHIP', () => {
      const manifest = readOwnershipManifest(root);
      const owned = files.map(({ relativePath, source, target }) => targetState(source, target, relativePath, manifest));
      const { entries: legacyEntries, directories: retiredDirectories, preservedSkills } = retiredPayload(root, files, manifest);
      const legacyStates = legacyEntries.map(({ relativePath, expectedHash }) => legacyTargetState(root, relativePath, expectedHash));
      const counts = {
        missing: owned.filter((state) => state === 'missing').length,
        current: owned.filter((state) => state === 'current').length,
        owned: owned.filter((state) => state === 'owned').length,
        conflicts: owned.filter((state) => state === 'conflict').length,
      };
      const legacyCounts = {
        missing: legacyStates.filter((state) => state === 'missing').length,
        owned: legacyStates.filter((state) => state === 'owned').length,
        conflicts: legacyStates.filter((state) => state === 'conflict').length,
      };
      if (counts.conflicts > 0 || legacyCounts.conflicts > 0) {
        const stderrLines = [];
        for (let index = 0; index < files.length; index += 1) {
          if (owned[index] === 'conflict') stderrLines.push(`Refusing to ${options.command === 'install' ? 'overwrite' : 'remove'} different existing file: ${files[index].target}`);
        }
        for (let index = 0; index < legacyEntries.length; index += 1) {
          if (legacyStates[index] !== 'conflict') continue;
          const entry = legacyEntries[index];
          const retiredSkill = retiredDirectories.some((directory) => (
            directory.startsWith(`${join(root, 'skills')}${sep}`) && entry.target.startsWith(`${directory}${sep}`)
          ));
          const retiredDirectory = retiredSkill ? 'the retired skill directory' : 'the retired payload directory';
          stderrLines.push(`Refusing legacy conflict: ${entry.target} is not package-owned. Move it out of ${retiredDirectory} or remove it yourself, then rerun the install so the directory can be cleaned.`);
        }
        const legacyDetail = legacyEntries.length === 0
          ? ''
          : ` · ${legacyCounts.missing} legacy missing · ${legacyCounts.owned} legacy owned · ${legacyCounts.conflicts} legacy conflicts`;
        const error = new Error(`${counts.missing} missing · ${counts.current} already-current · ${counts.owned} owned · ${counts.conflicts} conflicts${legacyDetail}`);
        error.step = 'OWNERSHIP';
        error.stderrLines = stderrLines;
        error.legacyOwnershipConflict = legacyCounts.conflicts > 0;
        throw error;
      }
      const legacyDetail = legacyEntries.length === 0
        ? ''
        : ` · ${legacyCounts.missing} legacy missing · ${legacyCounts.owned} legacy owned · ${legacyCounts.conflicts} legacy conflicts`;
      return {
        value: { states: owned, counts, manifest, legacyEntries, legacyStates, legacyCounts, retiredDirectories, preservedSkills },
        detail: `${counts.missing} missing · ${counts.current} already-current · ${counts.owned} owned · ${counts.conflicts} conflicts${legacyDetail}`,
      };
    });

    for (const preserved of states.preservedSkills) stderr.write(`Warning: keeping modified legacy skill at ${preserved}; review or remove it yourself.\n`);

    step = 'WRITE';
    if (options.command === 'uninstall') {
      const writeStarted = process.hrtime.bigint();
      progress.start('WRITE');
      let removed = 0;
      let statusLineResult = null;
      try {
        if (options.scope === 'user') statusLineResult = removeStatusLine(root);
        for (let index = 0; index < files.length; index += 1) {
          if (!['current', 'owned'].includes(states.states[index])) continue;
          unlinkSync(files[index].target);
          removed += 1;
        }
        removed += removeLegacyFiles(states.legacyEntries);
        removeRetiredDirectories(states.retiredDirectories);
        removeEmptyPayloadDirectories(payloadDirectories(root, files));
        removeOwnershipManifest(root, states.manifest);
        const statusDetail = statusLineResult ? ` · ${statusLineResult.detail}` : '';
        progress.finish('ok', 'WRITE', `${removed} removed · ${states.counts.missing} already absent${statusDetail}`, elapsedSince(writeStarted));
      } catch (error) {
        progress.finish('failed', 'WRITE', errorText(error), elapsedSince(writeStarted));
        if (error && typeof error === 'object') error.step = 'WRITE';
        throw error;
      }
      const receipt = receiptCard(options, displayRoot, colors, { status: 'Removed', written: 0, current: states.counts.current });
      progress.close();
      stdout.write(receipt);
      return 0;
    }

    if (states.states.every((state) => state === 'current') && states.legacyStates.every((state) => state === 'missing') && states.retiredDirectories.length === 0) {
      let statusLineResult = null;
      try {
        writeOwnershipManifest(root, files, states.manifest);
        if (options.statusLine) statusLineResult = installStatusLine(root);
      } catch (error) {
        if (error && typeof error === 'object') error.step = 'WRITE';
        throw error;
      }
      const statusDetail = statusLineResult ? ` · ${statusLineResult.detail}` : '';
      skipStep(progress, 'WRITE', `SKIPPED · 0 written · ${states.counts.current} already-current${statusDetail}`);
      const receipt = receiptCard(options, displayRoot, colors, { status: 'Already current', written: 0, current: states.counts.current });
      progress.close();
      stdout.write(receipt);
      return 0;
    }

    const writeStarted = process.hrtime.bigint();
    progress.start('WRITE');
    let installed = 0;
    try {
      for (let index = 0; index < files.length; index += 1) {
        if (states.states[index] === 'current') continue;
        const { source, target } = files[index];
        mkdirSync(dirname(target), { recursive: true });
        if (states.states[index] === 'owned') replaceOwnedFile(source, target);
        else copyFileSync(source, target, constants.COPYFILE_EXCL);
        installed += 1;
      }
      const removedLegacy = removeLegacyFiles(states.legacyEntries);
      removeRetiredDirectories(states.retiredDirectories);
      writeOwnershipManifest(root, files, states.manifest);
      const statusLineResult = options.statusLine ? installStatusLine(root) : null;
      const legacyDetail = removedLegacy === 0 ? '' : ` · ${removedLegacy} legacy removed`;
      const statusDetail = statusLineResult ? ` · ${statusLineResult.detail}` : '';
      progress.finish('ok', 'WRITE', `${installed} written · ${states.counts.current} already-current · ${states.counts.owned} owned${legacyDetail}${statusDetail}`, elapsedSince(writeStarted));
    } catch (error) {
      progress.finish('failed', 'WRITE', errorText(error), elapsedSince(writeStarted));
      if (error && typeof error === 'object') error.step = 'WRITE';
      throw error;
    }
    const receipt = receiptCard(options, displayRoot, colors, { status: 'Ready', written: installed, current: states.counts.current });
    progress.close();
    stdout.write(receipt);
    return 0;
  } catch (error) {
    progress.close();
    reportFailure(error, { stderr, stdout, options, root: displayRoot, colors, step });
    return 1;
  }
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await run(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`litgrok: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
