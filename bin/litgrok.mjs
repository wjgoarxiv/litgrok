#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { constants, copyFileSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMark, terminalMode } from '../.grok/hooks/lit-mark.mjs';
import { applyStoredGround, backupIfSectionAbsent, decideGround, groundReport, ruleSourceForInstall, runGround } from './ground-rule.mjs';
import { installNotifications, installStatusLine, removeNotifications, removeStatusLine } from './status-line-config.mjs';

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
  'hooks/plan-gate.mjs': '0477520c23776d4031e0703fc0d776a53a7e2938f5ec1a41ac0f3388bc91d7a3',
  'hooks/post-tool-use-failure.mjs': 'b6d290bb93909a4a1a5abbba25ccc87a3ccd806a3d2810868297bab9db18b784',
  'hooks/post-tool-use.json': 'ddccda78e32ca3f072cba48ce57a413e54e9f9da36376fadbb08eeae1fe5c95b',
  'hooks/post-tool-use.mjs': '8984c47025285cfe2bc4a4f34edcba5921c96071703306a8c39fbc7874b73cdb',
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
  'skills/comment-checker/SKILL.md': 'b5a595f3a8069e9f01dc77619dd830e8ea46287cc45f4c0c72124d03d9b9da97',
  'skills/debugging/SKILL.md': '42e71b0e632d4f1afd4f1a0c304586d5cf2f1f4db3e1edb4e675214326bd1664',
  'skills/debugging/references/methodology/02-investigate.md': 'c9d02c7419df3180ae0f66455ff34ee533fa0b928e6541dac30d80bb91b4aa87',
  'skills/deep-interview/SKILL.md': '8fba6a534816f8d58e55469374f6d6de9e61156b90f95197bbb9e94be17930f0',
  'skills/frontend-ui-ux/SKILL.md': 'eb150141ee376401a886ff04ea2dd70284c9ad65e59d8bb0345866addf065711',
  'skills/lit-comprehend/SKILL.md': 'bec52c1a2d8ffcd356a0f253358d08e7a5a0b0735917bb71b6b616d87eb4b105',
  'skills/lit-comprehend/references/artifact-format.md': '8ba41293b8e7277078ffaab6df65130c018575592f20740162b13e59f6295492',
  'skills/lit-comprehend/references/artifact-template.md': '26ac49b02bc32c1aba0e33cb67fc57a6c1d3c846309b49aaf34ac69f13dea925',
  'skills/lit-comprehend/references/honesty-ledger-contract.md': '3c167739feeb88baa5d286116744c35101f516610e0cdd180f27838dab4ae418',
  'skills/lit-comprehend/references/worked-explainer.md': 'c6ecde363a39760632e8c7f296d14ea32df508afebb99c101cc68ee021d0fac4',
  'skills/lit-handoff/SKILL.md': '7152d6399fd778ab3d16e1abad2ec97e2f4be4350cd3993cdde038cc1211dd80',
  'skills/lit-plan/SKILL.md': '0efb869398cedf36128ec2160eee660da8df8d324cdc18f56256fe7d08ff8d78',
  'skills/lit-plan/references/plan-schema.md': '1799c070eb8cf465f1737ac7d25409b6bfb245beb4c589e7bd69e2058861d74d',
  'skills/lit-plan/scripts/scaffold-plan.mjs': '3b5784f7c39af28afcf8d9f3df872cbfd3bf2bb46855b1d0370145ac18cff876',
  'skills/lit-recap/SKILL.md': '65f76df0ce9170bbc0c6a0bd7110f6a6eb0169e6f92c4fc3bd32e28cf0232dc1',
  'skills/lit-scientific-visualization/SKILL.md': 'ffc3b2ea49dd7e7c4c7d4568f289df294a3a30f953c11039f98aaf6f8fb983ee',
  'skills/litgoal/SKILL.md': 'e3fd76a8f4c91903ab85073b492f3981f76cb17644b840ba22d2a1c5e82178a9',
  'skills/litgrok/SKILL.md': '6ea1fb66d5a1458e182cff5808ccc416487dbbad0341988bcda0f247645081e2',
  'skills/litresearch/SKILL.md': '93cf90ef9706531b7cacbce434a6eea13c3350df3266a25aabfa3149c0d82bf4',
  'skills/litwork/SKILL.md': '771b7cead03c0d1d1e67af82e308ea0980b8ab18474026516798f559048beda7',
  'skills/lsp-setup/SKILL.md': '313ffd924f00a1523905d2588e0812c8edcaec84b114d2d487506bd905e5376d',
  'skills/lsp-setup/references/bash/README.md': 'aa6fd2b04ab55139e667363e1b135e06bb077e801d66ebff2294fd253b6c4d8e',
  'skills/lsp-setup/references/c-cpp/README.md': '93c7f759c8f058aae7a43f457251b1b7631167cf8408f97be60681a3b1a40120',
  'skills/lsp-setup/references/csharp/README.md': '687fbbfb814f1443cb11c916c70f3c374d7f90ec5e1135bfe3b239e7b7615c42',
  'skills/lsp-setup/references/dart/README.md': '3f8abf0b9e81d3e66af27a419ecd27f05b58deb55b67d7f9067224b854790e58',
  'skills/lsp-setup/references/elixir/README.md': '92fa887eda596ebd6edde47cca68250a3d6395e406dc98be1654d259596de13d',
  'skills/lsp-setup/references/go/README.md': '0dcdc79be1220f8cea1c908756a77dba386ceaff4aa644658ff16186de8391a2',
  'skills/lsp-setup/references/haskell/README.md': 'e59d8b06782cab4aa29a3dfcfda44e54e6e10ac9d03b4e65db01f2e1605b8210',
  'skills/lsp-setup/references/java/README.md': '45a0a16a4460aa861794cda6bb09460e9c58714db6b16ae4de5f6d7754bfea22',
  'skills/lsp-setup/references/julia/README.md': '50c3e0566bb23ac170bca5f98556daa9d524a702de754e3e7da7ae0d4d8d08af',
  'skills/lsp-setup/references/kotlin/README.md': 'ebf9adf88dd5808d698e0a6d5c3bf1de114e5b87aa82a8f5aae73344639dd930',
  'skills/lsp-setup/references/lua/README.md': 'cdfafc79777258d36de12362a6f446fb647767f61f9a48534079477ec8833c18',
  'skills/lsp-setup/references/php/README.md': '1431440877f33c25d8367501cf3896e08a4fb57d863347578b466aa22a2809dc',
  'skills/lsp-setup/references/python/README.md': 'b370324a479b5151e55afcc5bd59accf573a0252fa00796d1c44ccd039430153',
  'skills/lsp-setup/references/ruby/README.md': 'f53ce1347339d7b6194275cde96fa9a9ee973dbff9be88b82ded8cf0bf9acb2e',
  'skills/lsp-setup/references/rust/README.md': 'a8287717b3e09826d9791df56b07c0c0bd2e45bb30faf3dc9bd7556b13e6c47f',
  'skills/lsp-setup/references/swift/README.md': '863927f6275d17ba9a325d635c149dcd61936ea33485633b6cb5414cb61c035d',
  'skills/lsp-setup/references/terraform/README.md': '5711b1ffc8c6b91f37e644f08fbb35002f673a0b650e5795e588cf72fc935c1b',
  'skills/lsp-setup/references/typescript/README.md': '9aa436e506ce95e3c5ae2a7ef73a28449135e8b6ff4bb8cf350d383666923a74',
  'skills/lsp-setup/references/yaml/README.md': 'cd1ed82b29ac5b04f5026ed785c5cfe3b6104ef4e6a1e4f7a7fea07f8995fdd3',
  'skills/lsp-setup/references/zig/README.md': '2df69b12907044eef11beb3c2f363264848cbda02d6ecd0035000888d91a4289',
  'skills/lsp-setup/scripts/lsp-server-table.mjs': 'c59d5a9a060eb67f701f025824c7e33930d0071d03c9f131128156f87895322e',
  'skills/lsp/SKILL.md': '2e4b1abdd0b03e993b8082ac34adc11de2fe6553f623e4a434b10a20499c4aad',
  'skills/lsp/references/built-in-lsp-contract.md': 'bf9dc6d557ccee329fa15507d41b431cf063bce5ac5345c732ad22b121a4ec15',
  'skills/refactor/SKILL.md': '5fd2df1a36eae216f8af4db09e7e7d26231b167907ad19c49465153a1dcadde0',
  'skills/review-work/SKILL.md': 'acfef3ff9c6e243cb9b88169a67e749e27a2e530af09aed07a2d66dd932c3b5d',
  'skills/rules/SKILL.md': 'b880136962faeb3dea93cc42e30f5d3cc461a03fe71f7ff908d4b09170c38c5f',
  'skills/start-work/SKILL.md': 'ddc7357f99c78cd3405c1cb0202f9b13871efbe59f365e9f39727c429791028b',
  'skills/structural-search/SKILL.md': '3bbc13b5d0df58fbae07dd53e7ecbf13f311f12311cc3bd313803d63bd331ee0',
  'skills/visual-qa/SKILL.md': '6eec3dae66938ad0b0c0d1eb904e7e63b2281bd1179a6a66b879f04c324a596c',
  'skills/wikify/SKILL.md': 'b21e423139e86f62c5aa6ffb8c8c3dc420c33d311ca07c33fb11aa0d67da6d65',
});
const PRE_MANIFEST_LEGACY_PAYLOAD_HASHES = Object.freeze({
  'agents/litgrok-boulder-executor.md': '7e4d4d8512f2a0a9baf547a8d0bf586427d359f5c22e31fceb424d7b60def7dd',
  'agents/litgrok-oracle-verifier.md': '4bc9a904851c5d37c1bfc6539ec4d52ed63fefa95eecfdba7eaaa9164290324e',
  'agents/litgrok-prometheus-planner.md': 'dd74ec91b0bacd3fdba46799cebd33964bd93957b7d0224a7a2e5627a71cb99a',
  'skills/ai-slop-remover/SKILL.md': 'f3f4bc4e18bd0dd0162e06fbb61d6640489f73a58f7ef31acda78a84a4175486',
  'skills/frontend-ui-ux/LICENSE': '738f69dfa83db5c347c678fb9d90e560877059f0de93a327c39001bff92dc014',
  'skills/frontend-ui-ux/PROVENANCE.json': 'a00be969523fe376a07d310b7418be0c41824f01241294bdf00e82eb4d736e87',
  'skills/frontend-ui-ux/SOURCE-MANIFEST.json': '9adf471d95aaf17e7866e1c7674cb1a101daae9abdab87c71c96a60f2a58e6fa',
  'skills/frontend-ui-ux/THIRD-PARTY-NOTICE.txt': 'ca1e7d88104177450ff848296cf9340f5f69aa421c4f215673a72a33c03c927e',
  'skills/frontend-ui-ux/data/design-intelligence.json': 'a89011236a6ff14e12ec55fccbfab1bbd40ae34614cea5710c022121aa841bb8',
  'skills/frontend-ui-ux/references/_canonical-corpus/legal/frontend-ATTRIBUTION.md': 'a73cd147a533442218a9adef53d99e0eaf15c10d8db4819d9d1542727f077b92',
  'skills/frontend-ui-ux/references/_canonical-corpus/legal/frontend-LICENSE-Apache-2.0.txt': '9d95806a26532623360eb84bb17d298f394b55ef73fb4c0796d99b4319b2b0da',
  'skills/frontend-ui-ux/references/_canonical-corpus/legal/root-LICENSE': 'b083425948376611de9b92b0aeb7377e604505756ea427e541a34d9b030d4dc1',
  'skills/frontend-ui-ux/references/_canonical-corpus/manifest.json': '21ad6e1f113078c3266016b446ea311ddefc0a0843aaab1a8516dc9802459973',
  'skills/frontend-ui-ux/references/adaptive-layout.md': 'd01ad4e7a55c30bac4bba4f8af01a174b8774cfff8a872f2c8c4cfc45b605792',
  'skills/frontend-ui-ux/references/brand-and-imagery.md': 'ba428075259c9b1552f3b04ad0f91b9f9f914f71a6e827de1604a5b08e335034',
  'skills/frontend-ui-ux/references/complete-contract.md': '9b098e7030f0979ac7d213b76cdcd133f0c411b91baa275a193720637a5f6059',
  'skills/frontend-ui-ux/references/composition.md': '13692ff243d3779af762a10e1c93c675c57cb2ddb5d9fd9e071650ddd43c9b20',
  'skills/frontend-ui-ux/references/creative-directions.md': 'a8cf8d825e18553b98ae8d0a80b948d1c6842f2d15a36e07b185aa89af9682be',
  'skills/frontend-ui-ux/references/design/README.md': 'e9550b081ded238021f6021a79caa79be4d5bdec0eaff99717cf71ffe55c9571',
  'skills/frontend-ui-ux/references/design/_INDEX.md': 'a9916b8642972e087e57e2f64ea7dd61737914e61931853a1d3ea2624f2cd023',
  'skills/frontend-ui-ux/references/design/airbnb.md': '4cd7b1972080ebeb2c360b27271e1d898c153c46c9d7f038ed512bb5130577fc',
  'skills/frontend-ui-ux/references/design/airtable.md': '2bf4a6f853c23c8cf04f890654ad3cebec849a98de1655425b65e3ad25b69476',
  'skills/frontend-ui-ux/references/design/apple.md': '001c06b02855b8443b397bfef583be5dedfd96391dcae94d7e3050e64841ed4d',
  'skills/frontend-ui-ux/references/design/aside.md': '430c29884f7cddf2dee1ee8722c71d5f8a8bdf49218dbbc7cbbfba612ba37081',
  'skills/frontend-ui-ux/references/design/binance.md': '7e86c5ac3bb21e1a8f210dab37cf6f5fad0252015ce8959afe5ddffca55abde8',
  'skills/frontend-ui-ux/references/design/bmw.md': 'f04fb9e29769c567674bfbba43bebaa01760f303d5bd544770dd80bdf7e807fb',
  'skills/frontend-ui-ux/references/design/brutalist-skill.md': 'fffbaac8597f07679e9d87145533567658aedba3b5eca6f16a7075a333048caa',
  'skills/frontend-ui-ux/references/design/bugatti.md': '67f88865f620c03d2582af03fa2a1ca87599633deaab240035feb1ab8255cd05',
  'skills/frontend-ui-ux/references/design/cal.md': '520e5c64e4dc6e368e4870ae2b0470225d587a41e426399475046e3932c690a1',
  'skills/frontend-ui-ux/references/design/claude.md': '79063565b490ace245dbca4d134c5aff849d16b7004c1e8e23cea1ea98fa7eb5',
  'skills/frontend-ui-ux/references/design/clay.md': '885f8be9e2d5c61b4cd024c9d5c308a791a0d4b0d464a2015094b67884890375',
  'skills/frontend-ui-ux/references/design/clickhouse.md': '71b0f6cf864dd276afe3d8d3c93f8b6c969006fc8fd25b667b39ea07f32df496',
  'skills/frontend-ui-ux/references/design/clone-from-url.md': '1ebd9bc28f59d1944c7e6e9e9af39b728936725bf774d50b806116257e824dd1',
  'skills/frontend-ui-ux/references/design/cohere.md': 'c0a7270cd888b74a4cebb9621f075f9f2e2bca9712723110e890fe2366032668',
  'skills/frontend-ui-ux/references/design/coinbase.md': '52d6851e1cf6701d7b2344d148868e12f46b08ac80a65a31026e08e8ea6af66c',
  'skills/frontend-ui-ux/references/design/composio.md': 'c844f7873b28076dcce380204f5c79fbf3b63ce48a4f435907a36ad02bf5337d',
  'skills/frontend-ui-ux/references/design/cursor.md': '66f4f737a2fbc17cd37489f321bbfa799b202a28bcf0df2b86a70b7773926a69',
  'skills/frontend-ui-ux/references/design/design-system-architecture.md': 'bf749ed406c8a26d6422f610fb02c821760a20d47fc9b6921bf1522ac877bd5c',
  'skills/frontend-ui-ux/references/design/elevenlabs.md': '272e7f135ed7413ed666907c23a4d7ef2f4b7940fd5b796ae1b736927f45e011',
  'skills/frontend-ui-ux/references/design/expo.md': 'a1135f6a50e65ade8d129422922d7f63df41ed2929c2507e893e2582048c2849',
  'skills/frontend-ui-ux/references/design/ferrari.md': 'b77c3efadbc1a2f761ca5c66919d186e749067aa2c73c936b41708d35f7f1a3a',
  'skills/frontend-ui-ux/references/design/figma.md': '69ec480da3a8befab7b44ffd5cc4deca0c8ae8ac5ee690335413063fa1a38292',
  'skills/frontend-ui-ux/references/design/framer.md': '35d8767071c0d155864e1abbceb6c874b6c461986092e0bceb9f8bdf6dfdf0cc',
  'skills/frontend-ui-ux/references/design/gpt-tasteskill.md': '2e64c269953f2656c21bf5a0fa6b4568e82fe0c72b36e8f84758e090349966a5',
  'skills/frontend-ui-ux/references/design/hashicorp.md': '7532880ef6c1bd586a5fb6229563b69f26ee841994f5616c698e0316813042c6',
  'skills/frontend-ui-ux/references/design/ibm.md': 'eab18ea70c2e4da497a2e90a25e6e9919ac18a4136f1dcd35ce838c37c2586da',
  'skills/frontend-ui-ux/references/design/image-to-code-skill.md': '4c060a8064a8b13380bc2ef3d6e6a1d0b1e316aa093cd9807d0ce9e4eeb037fa',
  'skills/frontend-ui-ux/references/design/imagegen-brandkit.md': 'b0c4837e1bd140ca816ae54948754ddd2ac1e2a4d3619363777a80caf00b2ede',
  'skills/frontend-ui-ux/references/design/imagegen-frontend-mobile.md': '8a33389979f3074fa0926678e266ad2eb9234624472254469fc1ad916b9caa24',
  'skills/frontend-ui-ux/references/design/imagegen-frontend-web.md': '6b5c2256522fdba1e3313eafa3d743b960a7b13ec029d3e6586e04b23327c1f8',
  'skills/frontend-ui-ux/references/design/intercom.md': '00015191406ee315f7d9ef97a72f5272d9f47ce6fa7899332584a1990800aa72',
  'skills/frontend-ui-ux/references/design/kraken.md': '8b9a1b5eebcce82881debd4ab815e780ba98b091fc9568475ddfb36be94c0c24',
  'skills/frontend-ui-ux/references/design/lamborghini.md': 'ee84e6d0b5a779f53032fa8fec721c632d936a05006e97101150a882e43d7178',
  'skills/frontend-ui-ux/references/design/layout-skill.md': 'bf38b363120ca797c4c49421e64e707da81e42f0a7b4dc0d643e06e004308534',
  'skills/frontend-ui-ux/references/design/lazyweb.md': '9f19eeb60596123ac02d6d00b76dea76af43f3a2b1d67fb07d65c9bb50cf4ac1',
  'skills/frontend-ui-ux/references/design/linear.app.md': '4c7264d8bc0e26de761c550e9f0445b0e7d92078c1a288f3fdb604b4f6df8fb7',
  'skills/frontend-ui-ux/references/design/lovable.md': '8a568b388dca500e2eeb631eb05c6d10b7f64a6bdbd7401634a86ec4e1fd5191',
  'skills/frontend-ui-ux/references/design/mastercard.md': 'ba5a4f889cd52286b87cd06ebb9646ed91ea631dc6249491c0d27dde940f05c6',
  'skills/frontend-ui-ux/references/design/meta.md': '1d981f34450ed843495c5d1680b7c8e4ff13a48851c17001a376941c6b45a547',
  'skills/frontend-ui-ux/references/design/minimalist-skill.md': '36bc7328f085405f43b476938e62460fa573bf7e984e949e072bcf014831a44c',
  'skills/frontend-ui-ux/references/design/minimax.md': '2960199d25c4b9a1fd8bc4756d998ee49c6315d7db23ad7ac0e274365f91ac9e',
  'skills/frontend-ui-ux/references/design/mintlify.md': 'ada2deafc02f37cc83570319e5309e767164a6a52b1b097d85f667bfa0c911df',
  'skills/frontend-ui-ux/references/design/miro.md': '51f348feaf10f92873854e49dccb1c03a32bbb573f1de0bc87981d4d540f91d8',
  'skills/frontend-ui-ux/references/design/mistral.ai.md': '59424032ca98c9d00103a9dc65e3a0a25de1bf44c7e618cdb094376af72b84c1',
  'skills/frontend-ui-ux/references/design/mongodb.md': '8ade6a733fe3d4d264d3ce13dc8720203898c514568f39e9fcd26438c34a2ec7',
  'skills/frontend-ui-ux/references/design/nike.md': '44b623b34e5b6cabd50f2fe391578f05dbd2fe91ee517f1e38c2c1e4ed9f647a',
  'skills/frontend-ui-ux/references/design/notion.md': '94c550cc035a90aa08b6645e7b3105d2e579453f8415e57b3639319fdb7e5b23',
  'skills/frontend-ui-ux/references/design/nvidia.md': 'f1000c03abd65cd10835069bffc2e3e6f9a704e53e9e16d7134e12e2aa3d5fb9',
  'skills/frontend-ui-ux/references/design/ollama.md': 'a40ef634612c07706462e081b1b77ba18915faa60d2dea1a19c2945aa448b3f7',
  'skills/frontend-ui-ux/references/design/opencode.ai.md': 'beaa5092524e38e89825f4f59818e2b2dfdf86b6344c734c1fba3295d2d7bc90',
  'skills/frontend-ui-ux/references/design/output-skill.md': 'e5bf48b1ae561511439cf71672209a10a88cee0968cc925909ff861dfa0a96a7',
  'skills/frontend-ui-ux/references/design/pinterest.md': 'e6cb634aca8404b43b9eaeaf650bb64b0d26b1240bb3c33da643fded1fe1ecaa',
  'skills/frontend-ui-ux/references/design/playstation.md': 'aa328bc329428dd69daee224a64d8ad793dbdd340d9bb1cb8df2794dbbafabd6',
  'skills/frontend-ui-ux/references/design/posthog.md': 'a42b20545c777f732d6b9a0e24d877b229e84ce10a0e9e3ef9f058ea2c86fc5b',
  'skills/frontend-ui-ux/references/design/raycast.md': '20e65e05ed2eee597dcdb6c7b056bd70842d786c0888592dda255ef672d8dd60',
  'skills/frontend-ui-ux/references/design/react-dev-tooling-skill.md': '26f648a70311d870ffce17798f9ed17501911e483898ee04aed8b08686c36e20',
  'skills/frontend-ui-ux/references/design/redesign-skill.md': '98ad3e5b051bfb71b2795f7e8a6aa0d32b51ee095606c098a4b2822ac07926c9',
  'skills/frontend-ui-ux/references/design/renault.md': 'db03bb3402edff5e5e84395856777ea6629c40e12fc737c5ae935de5d613be37',
  'skills/frontend-ui-ux/references/design/replicate.md': 'c3932771f83333f143774ac5d18cf57e9a4083d1e6af7daec605bac715a62dfd',
  'skills/frontend-ui-ux/references/design/resend.md': 'c6c22baba6e185d30e8da94dac45ebf5d1ae0f21ec88f5e1b3ceeacc14bfe00e',
  'skills/frontend-ui-ux/references/design/revolut.md': '62501c2f1441717ee7e93f7df4f8acd637cdd25bc983db45c5d6c69be10a797a',
  'skills/frontend-ui-ux/references/design/runwayml.md': 'f873f90495a932a50d899f72600c231c76b3e706cdb17f90188747ad36613afc',
  'skills/frontend-ui-ux/references/design/sanity.md': '52354c55c1c62dd16aeffc037fad7494a6de918a59bd65843ebcb9e6357928fa',
  'skills/frontend-ui-ux/references/design/sentry.md': 'a5140c9bbf0bd45426646f087691abed9f8bd70d94d3e4368745622e5163cdaa',
  'skills/frontend-ui-ux/references/design/shopify.md': 'ab10135212d6d8a0eaf4003f29cf5072f9390c27fb5e109a7bb8d4e2a28f4931',
  'skills/frontend-ui-ux/references/design/soft-skill.md': 'e1e32f5e2d420872c6c7332b53d5ff7721946766b78c4822b424c2d512c8fdbc',
  'skills/frontend-ui-ux/references/design/spacex.md': 'ead7689f96a1c44f43cee4831b1525d52757c6aca820b9cf85569651d46ab0b7',
  'skills/frontend-ui-ux/references/design/spotify.md': 'd7f3bc8413a01de9ef15cac8807990be3561f1897c37d1db9ccf23d84b5b1386',
  'skills/frontend-ui-ux/references/design/starbucks.md': '25b116f858b197796ed4962457d07c9f0484e2d3c8e9a7604928358957bd61a3',
  'skills/frontend-ui-ux/references/design/stitch-design-example.md': '0ab6740c4ebb1966dbceddb823a66d4bf027e960efbd73faca56cbf8370ae2ad',
  'skills/frontend-ui-ux/references/design/stitch-skill.md': '46bdb08fee2dded38b6ba0a051230a502d6ac6e4044afd47592cb40c256028b5',
  'skills/frontend-ui-ux/references/design/stripe.md': '66dea910aa4e4d7a2cbda9ad93496da5d464f40f343e7a14b8b8029d873535ae',
  'skills/frontend-ui-ux/references/design/supabase.md': '341a8ad07bedf9134060f4c279007d6f920483e3b846ab6ce1d95a7c7b5b6914',
  'skills/frontend-ui-ux/references/design/superhuman.md': '93f9375d392f77255f9a98640b53f181076515378b83326782c6e6e12dc51f8e',
  'skills/frontend-ui-ux/references/design/taste-skill.md': 'aa194351b246b8b4799099d4ed7b033d29eab6e6e3d58d8d2172978be7b3ec89',
  'skills/frontend-ui-ux/references/design/tesla.md': 'ee98b4b8acb7a0e5d25921e085661bb855e3dbd04c98a5f2885c458a680594e3',
  'skills/frontend-ui-ux/references/design/theverge.md': '094db6e7a6369bef4539f7319b5bca116ed1b8e8784c51f8f36be84e566b46ce',
  'skills/frontend-ui-ux/references/design/together.ai.md': 'e1b6715a344774cf315eb011bc67252871531b0d8d8c55f650cb5a92aac52b4b',
  'skills/frontend-ui-ux/references/design/uber.md': '1defaaf4677a0ffd9bcd799ac58a8558dedd08e0066900741e1992d99f860dbc',
  'skills/frontend-ui-ux/references/design/vercel.md': '17d533f0ff2e1b5d9be3e69335ab7fc599d1ddf52bc9ac2f2dd36479676cbd3d',
  'skills/frontend-ui-ux/references/design/vodafone.md': '53a9b5279d5405a16952eaa9477f363519710a80a58db7d87fb6570327ccc860',
  'skills/frontend-ui-ux/references/design/voltagent.md': '2f58cadf75642185b09493a7bf00e81461acd67bdd543c021b22e254e3b2a32f',
  'skills/frontend-ui-ux/references/design/warp.md': '41e2006c2ee0c018673f8eed59de198d8ae08b0a4d3bca2a6bdf90a323e6463c',
  'skills/frontend-ui-ux/references/design/webflow.md': '0610a10e26546550ee70e8e1804d1222aaff6b355b68eacf8cab95f395516aba',
  'skills/frontend-ui-ux/references/design/wired.md': '2c370c20aec5d1a8ccb42e8788cb68b768f0f26f69e0e7f995f468fd96cac57f',
  'skills/frontend-ui-ux/references/design/wise.md': '71f1c384405e4641784aa0917b3eebb1ccb478fe11ea0cd6098b4979d4aaf59f',
  'skills/frontend-ui-ux/references/design/x.ai.md': '83107b1981e877d7e772f6bfc383b68d1349a84882e22e0c2cba0409e70d82e6',
  'skills/frontend-ui-ux/references/design/zapier.md': '01a80cc76a4c32defdca2efa34ebb34ba5a14ee6553894252a705d8e52228de4',
  'skills/frontend-ui-ux/references/designpowers/EVIDENCE.md': '1c5e5e8149c34cee0887381bf68890f3ad5a732dafd7ceb63395903da3ad6366',
  'skills/frontend-ui-ux/references/designpowers/README.md': '279635a5695f4dc4e7f342038074402bc4ed38f900b15623a88f988dd3b98640',
  'skills/frontend-ui-ux/references/designpowers/UPSTREAM.md': 'ea8c049856a3a6b71b5122bb590214c509ae445fa67412b1775b8e9bed0141b8',
  'skills/frontend-ui-ux/references/designpowers/lane-a-direction.md': '56f982df6cdef6ae6b821e3b16395c6f4908103eda8fae3c75ec22f615b718f9',
  'skills/frontend-ui-ux/references/designpowers/lane-b-execution.md': '591d7406e2836c0531e08d016073db6c77dd6c5ec69ee013f7fa1fe8a4283579',
  'skills/frontend-ui-ux/references/designpowers/lane-c-review.md': '23caaf59307351026b34dc2cdb60bc5b1656803b5326bfdb46671cee00bbc286',
  'skills/frontend-ui-ux/references/designpowers/lane-d-memory.md': '394da780de7ec826e238017b9a3d42b1195976a3c971e7dd1f7cd734cdc15336',
  'skills/frontend-ui-ux/references/designpowers/orchestration.md': '6c6de38691d0ac6e21ec43d79d9fdd37a894347e95999d6f39c7b012eca5c67d',
  'skills/frontend-ui-ux/references/designpowers/routing.md': '356b920ce02c632366f17b2cfe29ca62c544d99d4181e7e0128dd175c0bf8268',
  'skills/frontend-ui-ux/references/designpowers/vendor/LICENSE': '1400d572fb60897f7970a763fb73d1aa7804b71bad41bf6e45061de7b7a09ac1',
  'skills/frontend-ui-ux/references/designpowers/vendor/agents/accessibility-reviewer.md': '6a6e998da2b40a72255a44b531e4086cbc6106634bb8e62ebeb7a935156f0e59',
  'skills/frontend-ui-ux/references/designpowers/vendor/agents/content-writer.md': '4951ff11c75c05a077c720883ad60375d452c507bc07407beb29176a9fa383a0',
  'skills/frontend-ui-ux/references/designpowers/vendor/agents/design-builder.md': '2403ecca396ec779377c06ffebb9146293e749b350f6e71f64a4c3274d78e272',
  'skills/frontend-ui-ux/references/designpowers/vendor/agents/design-critic.md': '3a24ea2e289add3f50b51a603eaee0d3914d14233b9d325fa979fbf8723c0c12',
  'skills/frontend-ui-ux/references/designpowers/vendor/agents/design-lead.md': 'cae566ad39634ecfda58bbe7a6d5227406662cfd61d263a6bae4cf142c5b4435',
  'skills/frontend-ui-ux/references/designpowers/vendor/agents/design-scout.md': 'ee220d8e8fc7eb63ac37379f38c91e1211c49101bfe05bcadab8267cf45d1292',
  'skills/frontend-ui-ux/references/designpowers/vendor/agents/design-strategist.md': 'e1a0467b33f2f51ab9b393d5e45f274b7cc0851a20bc2477a3f59d73334ee8d5',
  'skills/frontend-ui-ux/references/designpowers/vendor/agents/heuristic-evaluator.md': '6f66c4c3369c3e034899ae9141326fab75cecc1c46920d46d28413f2f536052a',
  'skills/frontend-ui-ux/references/designpowers/vendor/agents/inspiration-scout.md': '9494bc48b836d74f68b57a111f29b75a050f38fb1ba5db18189119470a9af2a8',
  'skills/frontend-ui-ux/references/designpowers/vendor/agents/motion-designer.md': 'bb622b9e2d6456573032ecbd297fc031129231cdabcafc62a49eb0c38fc017d0',
  'skills/frontend-ui-ux/references/designpowers/vendor/skills/accessible-content/reference.md': '25c3c261f8dd9576166314e70cd6e4c45129805a2f66f288a9cb3abb4e0c723b',
  'skills/frontend-ui-ux/references/designpowers/vendor/skills/adaptive-interfaces/reference.md': '4e2ccfcca475309780ff8787c33ee533a3c50eb2b9c828795c0127f1d178a1c6',
  'skills/frontend-ui-ux/references/designpowers/vendor/skills/cognitive-accessibility/reference.md': '149ef820423a2f635a7bb937529084305dd5b34aacf28db3d26eb226d07e4c2f',
  'skills/frontend-ui-ux/references/designpowers/vendor/skills/design-debate/reference.md': 'b535ef96af6cd6a665d8e0fb70f7f7aa6d06aa9d6cad8390bb8694d4a59bf4f5',
  'skills/frontend-ui-ux/references/designpowers/vendor/skills/design-debt-tracker/reference.md': '995fa32d22f0fb672a1dea7d86051f8ce1f68cfd02f2a05a602e0d3fa497a494',
  'skills/frontend-ui-ux/references/designpowers/vendor/skills/design-handoff/reference.md': '48e357687f933f5fa30c186d6a024f68d60fa053dfe6e380085f1800d34f3233',
  'skills/frontend-ui-ux/references/designpowers/vendor/skills/design-md/reference.md': '07c94b9426ec1b9f5c35e31b06e46b885d5b67abd9c3c54591b860d8c66c79a8',
  'skills/frontend-ui-ux/references/designpowers/vendor/skills/design-retrospective/reference.md': '357f192c0b4d45da1e1a53ad8ba4a8ecc4112c0077abb995093de7aa461ef8be',
  'skills/frontend-ui-ux/references/designpowers/vendor/skills/design-review/reference.md': 'b099e87e80df676e8e971f70b0f85c9a4037cbbbd268991f4922650d2cdd1030',
  'skills/frontend-ui-ux/references/designpowers/vendor/skills/design-system-alignment/reference.md': 'fa12f778efb4644d20be837f352872107c2286fc15cb5a1889ab9d3291f5e87c',
  'skills/frontend-ui-ux/references/designpowers/vendor/skills/designpowers-critique/reference.md': '61a505f993a5abfd91eb53c76ef704cab9ed958d12dc3ed15926dc0bc0f11b30',
  'skills/frontend-ui-ux/references/designpowers/vendor/skills/heuristic-evaluation/reference.md': 'eae74cdd27f258687e137fe22d39c988a4b8bd83b4f48f5becbeaadea1cdf225',
  'skills/frontend-ui-ux/references/designpowers/vendor/skills/inclusive-personas/reference.md': '3ac1c22795c67ee7ecc8a2dbe2a25d4076d4585e655c99bf030cb718f8b44877',
  'skills/frontend-ui-ux/references/designpowers/vendor/skills/inspiration-scouting/reference.md': '49f2bc33294c72b642cccb2b3cf5d96a9d4fcf2fd56d1643b56b3f34b7d0078c',
  'skills/frontend-ui-ux/references/designpowers/vendor/skills/interaction-design/reference.md': '8fa3f1f1dec364f51c36bfdb79c18b97c81e8f1fedf03128057de331497981c6',
  'skills/frontend-ui-ux/references/designpowers/vendor/skills/motion-choreography/reference.md': 'f8b79372efa0cf0f35b841e175270f1608e0d479b4512a732cd00fa8252e65cd',
  'skills/frontend-ui-ux/references/designpowers/vendor/skills/research-planning/reference.md': '37e907ae662308daf241aa74c6e9ad957457a0b2ba6bc636f9a9a2732b0787c2',
  'skills/frontend-ui-ux/references/designpowers/vendor/skills/responsive-patterns/reference.md': '03771c1706b5df3d6e305fb877892bbb9813e3fa96f7a93c7f05c8df712f6afc',
  'skills/frontend-ui-ux/references/designpowers/vendor/skills/synthetic-user-testing/reference.md': '10fc3343cdccbcf55cb7cdbd13fae62128986e565e505cb98345312a70712981',
  'skills/frontend-ui-ux/references/designpowers/vendor/skills/taste-feedback/reference.md': '48d7eae20b3f1855a95970babffe0eb7af8798d78794be6c42261b05ecb91c9e',
  'skills/frontend-ui-ux/references/designpowers/vendor/skills/taste-report/reference.md': '312f62c923e2c100c9516b6577fcc90d535167decbb754c9c46087be48ebeda1',
  'skills/frontend-ui-ux/references/designpowers/vendor/skills/token-architecture/reference.md': '40621d1757aa0026e42e46afa92d5fffa8e427cf8ddf8a2670eee33ff2fae0a0',
  'skills/frontend-ui-ux/references/designpowers/vendor/skills/ui-composition/reference.md': '67fcef4c8115514210b3a013a08f714f05586270641fe66d8c9685051b9498a5',
  'skills/frontend-ui-ux/references/designpowers/vendor/skills/usability-testing/reference.md': 'f2ca4afb579371b093350bdf456159d4d28c85cd92ff583ebef71a8e19780f2d',
  'skills/frontend-ui-ux/references/designpowers/vendor/skills/verification-before-shipping/reference.md': '6277cc7fc59a4156bf5894079128fcabdaf679c47d721378cae450e29a1c4996',
  'skills/frontend-ui-ux/references/designpowers/vendor/skills/voice-and-tone/reference.md': '77daad2fc817adf8f58ed7c51b5be591361096fe532b52f83fe3f62181166d5b',
  'skills/frontend-ui-ux/references/designpowers/vendor/skills/writing-design-plans/reference.md': '98964a9308129c79f95ba47f377765388817902e27be4420c716b06e03f46197',
  'skills/frontend-ui-ux/references/evidence-review.md': 'acf7f23c4245610e93f75ad2ddd152a5f95d3da5a3e1707b5f7e7e528e855d6e',
  'skills/frontend-ui-ux/references/implementation-platforms.md': 'ce660ab433e2ab09e7a682aa245120fe1fec151cad48e5499fdd20d7db53f21e',
  'skills/frontend-ui-ux/references/inclusive-interface.md': 'a66102e8e7c74da9a84a613253082c6a89640410ab3645a8b4198ab32e66fa5a',
  'skills/frontend-ui-ux/references/interaction-motion.md': '58e6e5bfa8c9e741c51ecbc2fafe23794ef437c682c870924571bdd3ae7c9a26',
  'skills/frontend-ui-ux/references/operating-lanes.md': 'c97f9a5da66bf3ae9fc369bb92f179d17ec15c3ecb91868c49000a396f968b03',
  'skills/frontend-ui-ux/references/perfection/README.md': '5161a5c6d53827b819f053f6996dcba91c8debcad3d4aa1a493f06a1ec1c0ecd',
  'skills/frontend-ui-ux/references/perfection/react-perf-tooling.md': '0ddf4845f9a772ea018eb6d44d46407efa3e96371e41eaecb774595412f50bf6',
  'skills/frontend-ui-ux/references/performance-delivery.md': 'c1ddd98f40c851f900597ff1e557021a8d7f6df75b82904b4721afaa5ba80644',
  'skills/frontend-ui-ux/references/product-direction.md': '8e9a082dcff20f7ae80b6f2d280d56cf53bca7837a7e45d0357c62dd98634899',
  'skills/frontend-ui-ux/references/redesign-playbook.md': 'd20f96f7a269a4ec3bc61d40f3c86186aac4a77c9ae58462022cf31729f046d7',
  'skills/frontend-ui-ux/references/system-foundations.md': '020bd17304e604658b27565f710d531cdedc7b5a56db1a537fb94b7caffea394',
  'skills/frontend-ui-ux/references/taste-direction.md': 'f40ad20ce6abe9e07877b88dbcfe8f263061e54b79631e122dadc0f31fa02afc',
  'skills/frontend-ui-ux/references/ui-ux-db/README.md': '9bd26c52dfd10dfd613dd3cc85df217dc25a172e380bde41fdfa6fedda288b2a',
  'skills/frontend-ui-ux/references/ui-ux-db/data/charts.csv': 'ebb565308115f955791b0431797a89d9b3587c25d5babb9428d10712c4924817',
  'skills/frontend-ui-ux/references/ui-ux-db/data/colors.csv': '69ee8c1147b269599d20ca418bdd6f32563a9aa2d962fb9a9b8dec66bf7b1ba4',
  'skills/frontend-ui-ux/references/ui-ux-db/data/icons.csv': 'f376c29fb4df37b4bdb366a5aa70cb211ba3dd8b435390aaa03152a64b07d2e8',
  'skills/frontend-ui-ux/references/ui-ux-db/data/landing.csv': '080cedbcd61ff8ec9520f33929baa76bee9589e783f83b2f8d824a466b6a46d7',
  'skills/frontend-ui-ux/references/ui-ux-db/data/products.csv': '9fd9e776ba847cf44c1ea78f95fe5e33b2c56bb7e186e3cfff9c49bc7fcb691b',
  'skills/frontend-ui-ux/references/ui-ux-db/data/react-performance.csv': '904c8afcda229629545912dde0e8ac37503757131f0169f80b016f1f58c4fd3f',
  'skills/frontend-ui-ux/references/ui-ux-db/data/stacks/astro.csv': 'ad18dae3ab6d148d37d144592df80dc1825b6c9e86d9d2d68fdda77434206a37',
  'skills/frontend-ui-ux/references/ui-ux-db/data/stacks/flutter.csv': 'fe36d404c799781e8ba6e9a8179b45799ed5126a545528550cd2eb0f2346e8c5',
  'skills/frontend-ui-ux/references/ui-ux-db/data/stacks/html-tailwind.csv': '7aef38e75c53559470afcfa91580a9917ca8b7dbf8b92110389e23e93703ac52',
  'skills/frontend-ui-ux/references/ui-ux-db/data/stacks/jetpack-compose.csv': '6c8fd4b0391c342c12b0af15610cd5becbeccaef0bbe8dcfc01d928c3195d93e',
  'skills/frontend-ui-ux/references/ui-ux-db/data/stacks/nextjs.csv': 'e828ccc04843742f52f545a068e8a9ab0d2b97c0e771f7e93bf0cef74da05554',
  'skills/frontend-ui-ux/references/ui-ux-db/data/stacks/nuxt-ui.csv': '05d6e74501b2b6a636faed32450622759f49a5bcafad971f5f4e7eba0eb7be71',
  'skills/frontend-ui-ux/references/ui-ux-db/data/stacks/nuxtjs.csv': 'f7a3f2d9542856d00199f85c6c023b7c284cc698e2e6e12d61afce2edacb24d6',
  'skills/frontend-ui-ux/references/ui-ux-db/data/stacks/react-native.csv': 'a08ca77fcf6b6d9531982dce465366296013bfcf12d2938ac72ad57cf0c4f085',
  'skills/frontend-ui-ux/references/ui-ux-db/data/stacks/react.csv': 'e5624ab41d33427d88e41d07581ce4eca59b37b36ab72a6ad43a9c8e2d0a1c72',
  'skills/frontend-ui-ux/references/ui-ux-db/data/stacks/shadcn.csv': '395c2e415ef6f48a474acccdc8eb2c7258a6ed751a5037ba171a2d8823e02ded',
  'skills/frontend-ui-ux/references/ui-ux-db/data/stacks/svelte.csv': '71af52d64f266c88070b91dbbaa900c2f8074b6baae9f35eaea6ba9cec6fd803',
  'skills/frontend-ui-ux/references/ui-ux-db/data/stacks/swiftui.csv': 'c9c2d2510f8e66281a2514e8dd0125a6b653b9ef53a71281b5e7dfe003d5b569',
  'skills/frontend-ui-ux/references/ui-ux-db/data/stacks/vue.csv': 'c2724915d3c11cd67263f25896cff721f787a0fdd8326002d31e9f5806dfd8f8',
  'skills/frontend-ui-ux/references/ui-ux-db/data/styles.csv': '9b5089dcde8999333b36878252a255cc3bacbb2fe7b836c76cc7f7aa2abb643d',
  'skills/frontend-ui-ux/references/ui-ux-db/data/typography.csv': 'dbea262a54e3bfa2e6c3b15989a365d5ef4c43349316aff46635e82ca825adce',
  'skills/frontend-ui-ux/references/ui-ux-db/data/ui-reasoning.csv': '41976082ecae1100da937c949215dc6694393e03f3c2a7444dd92a9edb43cb11',
  'skills/frontend-ui-ux/references/ui-ux-db/data/ux-guidelines.csv': '1870ee048f2a2bdd60709f8f7adf7f3b6dcad560bc005c8b2915a8ac8639820d',
  'skills/frontend-ui-ux/references/ui-ux-db/data/web-interface.csv': '2a17ef810dab715ce1f339861817a8fbe3ccc38142b70517301e874803e838ac',
  'skills/frontend-ui-ux/references/ui-ux-db/scripts/core.py': '772b4d567c7a948c5d4a10343473b4123fec04238d250c9ffce31d0733f752c0',
  'skills/frontend-ui-ux/references/ui-ux-db/scripts/design_system.py': 'f7a21e83739c5ac6ca3738846220f6a9eb7f3c1ae7a44989c5aaa2061ca60310',
  'skills/frontend-ui-ux/references/ui-ux-db/scripts/search.py': '6a565f960a672e16dd064ccadd3406db999bfd1a4bff4d609b36a8d4c6450b86',
  'skills/frontend-ui-ux/references/visual-language.md': 'e7211082a47ef56ad82b87d23e808f4ead64b9264dd347453abb127c0d488711',
  'skills/frontend-ui-ux/references/visual-reconstruction.md': '0564552624bf3fd862c09552933f2e7139f639e485da8a134ec7ab4f7b624573',
  'skills/frontend-ui-ux/schemas/design-contract-v1alpha1.schema.json': '90ae8e6b89ff7dfd3a7f255968e5f55ca88578924d7fb9be365dfccca507ab1a',
  'skills/frontend-ui-ux/schemas/design-contract-v1beta1.schema.json': 'e09ac42209c7af28882662936f35b2788444ca5008513d367f01affb9be7d623',
  'skills/frontend-ui-ux/schemas/design-contract-v1beta2.schema.json': '3e3aa7a2e7a6a52a564fd2ea617ebee35f85da989c1669b0a758309b69b0e75a',
  'skills/frontend-ui-ux/scripts/design-contract-format.mjs': 'cd0102b0d200c9b2952985dd8a238aacf48e7125f4fa69bdfb7522d39ceef9da',
  'skills/frontend-ui-ux/scripts/design-contract-inventory-rules.mjs': '9d898eb372be9418702d1624c0d3ce5fca0a0770d0c0960c63193a968076fd38',
  'skills/frontend-ui-ux/scripts/design-contract-rules.mjs': '5a9932b311d14ef60687ff5119c2008deed42ba574082971bd2a12c1e2253956',
  'skills/frontend-ui-ux/scripts/design-contract-surface-rules.mjs': '975fac73313ce9752ec05b0e020855209615e9489bbdf13f8f0141a4781d7ebd',
  'skills/frontend-ui-ux/scripts/design-data.mjs': '6263c1f13af7b6dad75f808649660627130279a7affef6780bba750b2cd66509',
  'skills/frontend-ui-ux/scripts/errors.mjs': '62047a42a773e85287fd2006a4ebdbf6defdedf98f14560fc7693417136a0a78',
  'skills/frontend-ui-ux/scripts/import-design-intelligence.mjs': '463e28da2cf102b62fd372b4b507f1e716b8ce349db4361e0027a500619b3291',
  'skills/frontend-ui-ux/scripts/json-boundary.mjs': '0328c3109d20d6e4ea859c1e902be1e3875e95ae45461162a7c0f6048f021e66',
  'skills/frontend-ui-ux/scripts/query-design-intelligence.mjs': '9ce306b377165f4d81117988b3f72f538e98cea75cca6661229e2d022aebfe41',
  'skills/frontend-ui-ux/scripts/search.mjs': 'a08531cf2fece7b4cf4a7290cb7afbdbf90b72c0cf6cd0101df86986da86b517',
  'skills/frontend-ui-ux/scripts/source-replay.mjs': 'e3a25ff3c84bffaed1a6af4410a655986939279ef11bbc739890164b4f7af04d',
  'skills/frontend-ui-ux/scripts/strict-json.mjs': 'd941f327aabce5ffc212770852cfbc7e08dd03471e4e9bc9560eff54f06d489a',
  'skills/frontend-ui-ux/scripts/validate-design-contract.mjs': 'f05997c3836764b9f6326efe457b91fe187ca5735bb0ce10f54f14b5b1ca0e3a',
  'skills/frontend-ui-ux/scripts/verify-canonical-corpus.mjs': '6b2b90468ec1b631819a9da2377378fbc91dbc26e82670d660d715051ed7f7ce',
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
  'skills/lit-scientific-visualization/scripts/verify-canonical-corpus.mjs': 'a1cfe0578195098dc4afc2d25f0d391f38aeaa57cd3970fa7dca51e20cbf929d',
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
  'skills/visual-qa/references/capture-playbook.md': 'b2fa4412c5ad8e3a8e73e7970ac708835650724e97639c9fcdcf09e8e1192029',
  'skills/visual-qa/references/complete-contract.md': '9562a993b9fc75f8cda5e5f810ff534590f4ace36e696bf60119c0b27ba19cd5',
  'skills/visual-qa/references/verdict-taxonomy.md': 'efdf5e030ecbd596021bbf0e4dc259f72c33f7d4a3055919b59d0af6ce998099',
  'skills/visual-qa/scripts/verify-evidence-manifest.mjs': '94be132b01eff2af91775a6e9c6841c6ecf008d44f641c61a4bf16726c11f779',
  'skills/lit-korean/SKILL.md': 'dc2e4b0ea2ff6acca904f05767a62448387571e4183a615d5e53b230704ee828',
});
const USAGE = 'Usage: litgrok [install|uninstall] [--user|--project] [--status-line] [--notify] [--dry-run] [--no-color] [--yes] [--no-ground]\n       litgrok ground on|off|status\n       litgrok ground project [--dir <path>] [--remove] [--dry-run]\n       litgrok auto-handoff on [percent]|off|status\n       litgrok doctor [--no-color]\n';
const BRAILLE_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_INTERVAL_MS = 80;
const CLEAR_LINE = '\r\u001b[2K';

function parseInstall(args) {
  const remaining = [...args];
  let command = 'install';
  if (['install', 'uninstall'].includes(remaining[0])) command = remaining.shift();
  if (remaining.some((argument) => !['--user', '--project', '--status-line', '--notify', '--dry-run', '--no-color', '--yes', '--no-ground'].includes(argument))) return null;
  if (remaining.includes('--user') && remaining.includes('--project')) return null;
  // Both opt-ins change ~/.grok/config.toml, which only a user install may touch.
  if ((remaining.includes('--status-line') || remaining.includes('--notify')) && (command !== 'install' || !remaining.includes('--user'))) return null;
  return {
    command,
    dryRun: remaining.includes('--dry-run'),
    noColor: remaining.includes('--no-color'),
    yes: remaining.includes('--yes'),
    noGround: remaining.includes('--no-ground'),
    statusLine: remaining.includes('--status-line'),
    notify: remaining.includes('--notify'),
    scope: remaining.includes('--user') ? 'user' : 'project',
  };
}

// What the user-config opt-ins did, appended to the WRITE step.
function configDetail(...results) {
  return results.filter(Boolean).map((result) => ` · ${result.detail}`).join('');
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
  return { path: target, hashes, version: parsed.version };
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
  // A path the previous manifest owned that this payload no longer ships (a skill that shrank into a
  // stub, a helper that moved) retires like a renamed skill's files: removed while its hash matches.
  const droppedPath = (path) => manifest !== null && !currentPaths.has(path);
  const retiredPath = (path) => droppedPath(path) || skillRoots.some((directory) => path.startsWith(`${directory}/`))
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
    .map(([relativePath, expectedHash]) => ({ root, relativePath, expectedHash, target: join(root, relativePath), dropped: droppedPath(relativePath) }));
  return { entries, directories, preservedSkills: preservedSkills.map((path) => join(root, path)) };
}

// A skill that became a note (it moved to the LitFamily extension shelf) loses the body files the last install
// owned. Anything else in that folder is not the installer's, so the update leaves it there and names it.
function keptBesideNotes(root, files, legacyEntries) {
  const currentPaths = new Set(files.map(({ relativePath }) => normalizedRelativePath(relativePath)));
  const legacyPaths = new Set(legacyEntries.map(({ relativePath }) => relativePath));
  const notes = new Set(legacyEntries
    .filter(({ dropped, relativePath }) => dropped && relativePath.startsWith('skills/'))
    .map(({ relativePath }) => relativePath.split('/').slice(0, 2).join('/'))
    .filter((path) => currentPaths.has(`${path}/SKILL.md`)));
  const kept = [];
  function visit(path, note) {
    let children;
    try {
      children = readdirSync(join(root, path), { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return;
      throw error;
    }
    for (const entry of children.sort((left, right) => left.name.localeCompare(right.name))) {
      const child = `${path}/${entry.name}`;
      // A symbolic link is never followed; it is named like any other entry the installer did not write.
      if (entry.isDirectory()) visit(child, note);
      else if (!currentPaths.has(child) && !legacyPaths.has(child)) kept.push({ target: join(root, child), note });
    }
  }
  for (const path of [...notes].sort()) visit(path, path.split('/')[1]);
  return kept;
}

function keptFileWarning({ target, note }) {
  return `Warning: keeping ${target} beside the ${note} note. LitGrok did not write it, and the installer owns that folder, so move it somewhere of your own.`;
}

// Read-only: what a real run would remove, refuse and keep, so an upgrade's deletions are visible before it runs.
function previewOwnership(root, files, command) {
  const lines = [];
  let manifest;
  let entries;
  let legacyStates;
  let states;
  try {
    manifest = readOwnershipManifest(root);
    states = files.map(({ relativePath, source, target }) => targetState(source, target, relativePath, manifest));
    ({ entries } = retiredPayload(root, files, manifest));
    legacyStates = entries.map(({ relativePath, expectedHash }) => legacyTargetState(root, relativePath, expectedHash));
  } catch (error) {
    return [`would refuse: ${errorText(error)}`, 'Preview: the real run stops before writing anything until that is resolved.'];
  }
  let removed = command === 'uninstall' ? states.filter((state) => state === 'current' || state === 'owned').length : 0;
  let refused = 0;
  for (let index = 0; index < files.length; index += 1) {
    if (states[index] !== 'conflict') continue;
    lines.push(`would refuse ${files[index].target} (it differs from the copy the last install wrote)`);
    refused += 1;
  }
  for (let index = 0; index < entries.length; index += 1) {
    if (legacyStates[index] === 'owned') {
      lines.push(`would remove ${entries[index].target}`);
      removed += 1;
    } else if (legacyStates[index] === 'conflict') {
      lines.push(`would refuse ${entries[index].target} (this release no longer ships it, and it is not the copy the last install wrote)`);
      refused += 1;
    }
  }
  const kept = keptBesideNotes(root, files, entries);
  for (const { target, note } of kept) lines.push(`would keep ${target} (not written by LitGrok, beside the ${note} note)`);
  const written = states.filter((state) => state === 'missing' || state === 'owned').length;
  const counts = command === 'uninstall'
    ? `${removed} to remove · ${refused} refused · ${kept.length} kept`
    : `${written} to write · ${removed} to remove · ${refused} refused · ${kept.length} kept`;
  lines.push(`Preview: ${counts}`);
  if (refused > 0) lines.push('The real run stops before writing anything until you move the refused files out or remove them yourself.');
  return lines;
}

const SHELF_URL = 'https://github.com/wjgoarxiv/wjgoarxiv-skills';
// 1.0.34 was the last release that shipped the office and motion engines, so an install recorded by it or an
// older release may have left their caches behind.
const LAST_ENGINE_RELEASE = '1.0.34';

function oldEngineCaches(env, home, manifest, ownedBefore) {
  const upgrade = manifest
    ? stableVersion(manifest.version) !== null && !isNewerVersion(manifest.version, LAST_ENGINE_RELEASE)
    : ownedBefore > 0;
  if (!upgrade) return [];
  const cacheHome = typeof env.XDG_CACHE_HOME === 'string' && isAbsolute(env.XDG_CACHE_HOME) ? env.XDG_CACHE_HOME : join(home, '.cache');
  return ['office-docs', 'motion-runtime'].map((name) => join(cacheHome, 'litgrok', name)).filter((path) => {
    try {
      return lstatSync(path).isDirectory();
    } catch {
      return false;
    }
  });
}

function extensionsCard(colors, caches) {
  const titleColor = '38;2;255;99;55';
  return [
    `  ${paint('╭─ LITFAMILY EXTENSIONS', titleColor, colors)}`,
    "  │ LitGrok's core is complete and works on its own.",
    '  │ Nine skills that make files (decks, documents, figures, design and video covers) are now',
    `  │ LitFamily extensions, kept on the extension shelf at ${SHELF_URL}:`,
    '  │ lit-pptx, lit-docx, lit-scientific-visualization, lit-diagram-drawer, lit-schematic,',
    '  │ frontend-ui-ux, visual-qa, readme-studio and lit-typographic-motion.',
    '  │ Install the ones you use beside LitGrok for the full LitFamily experience:',
    `  │   git clone ${SHELF_URL}`,
    '  │   grok plugin install "<path to your wjgoarxiv-skills clone>/variants/litgrok/<skill>" --trust',
    "  │ Run the check in that skill's note first: it finds an installed or personal copy.",
    '  │ To update one: git -C "<path to your wjgoarxiv-skills clone>" pull, then grok plugin uninstall <skill> and the install line again.',
    ...(caches.length > 0
      ? [`  │ Earlier releases left engine caches at ${caches.join(' and ')}. Nothing reads them now (the extensions keep their own), so you can delete them.`]
      : []),
    `  ${paint('╰─', titleColor, colors)}`,
    '',
  ].join('\n');
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

const UPDATE_REGISTRY_URL = 'https://registry.npmjs.org/@litfamily%2flitgrok/latest';
const UPDATE_CHECK_TIMEOUT_MS = 3000;
const UPDATE_INSTALL_LINE = 'npm exec --yes --package @litfamily/litgrok@latest -- litgrok install';
const UPDATE_OPT_OUTS = ['NO_UPDATE_NOTIFIER', 'CI', 'LITGROK_NO_UPDATE_CHECK'];

function stableVersion(value) {
  const match = typeof value === 'string' ? /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.exec(value) : null;
  return match ? match.slice(1).map(Number) : null;
}

function isNewerVersion(candidate, current) {
  const a = stableVersion(candidate);
  const b = stableVersion(current);
  if (!a || !b) return false;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index];
  }
  return false;
}

async function latestRegistryVersion(fetchFn) {
  // A referenced timer, unlike AbortSignal.timeout, keeps the process alive until the bound fires.
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error('registry check timed out');
      controller.abort(error);
      reject(error);
    }, UPDATE_CHECK_TIMEOUT_MS);
  });
  try {
    return await Promise.race([deadline, (async () => {
      const response = await fetchFn(UPDATE_REGISTRY_URL, { headers: { accept: 'application/json' }, signal: controller.signal });
      if (!response.ok) throw new Error(`registry answered ${response.status}`);
      const version = (await response.json())?.version;
      if (!stableVersion(version)) throw new Error('registry answered without a stable version');
      return version;
    })()]);
  } finally {
    clearTimeout(timer);
  }
}

// Read-only: prints the package version and, at most, one notify-only update line.
// It never installs; the user runs the printed command themselves.
async function runDoctor(args, { env, stdout, stderr, fetchFn }) {
  if (args.some((argument) => argument !== '--no-color')) {
    stderr.write(USAGE);
    return 1;
  }
  const current = packageVersion();
  stdout.write(`litgrok ${current}\n${groundReport(env)}\n`);
  if (UPDATE_OPT_OUTS.some((name) => Object.hasOwn(env, name))) return 0;
  let latest;
  try {
    latest = await latestRegistryVersion(fetchFn);
  } catch {
    stdout.write('update check unavailable (offline or registry unreachable)\n');
    return 0;
  }
  if (isNewerVersion(latest, current)) stdout.write(`newer version available: ${latest} (run: ${UPDATE_INSTALL_LINE})\n`);
  return 0;
}

export async function run(args, context = {}) {
  if (args[0] === 'auto-handoff') {
    const { runAutoHandoff } = await import('../.grok/hooks/auto-handoff.mjs');
    return runAutoHandoff(args.slice(1), { env: context.env ?? process.env, stdout: context.stdout ?? process.stdout, stderr: context.stderr ?? process.stderr, cwd: context.cwd ?? process.cwd() });
  }
  if (args[0] === 'ground') return runGround(args.slice(1), context);
  if (args[0] === 'doctor') {
    return runDoctor(args.slice(1), {
      env: context.env ?? process.env,
      stdout: context.stdout ?? process.stdout,
      stderr: context.stderr ?? process.stderr,
      fetchFn: context.fetch ?? globalThis.fetch,
    });
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

  let files = discoveredPayload ? filesFromPayload(discoveredPayload) : null;
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
    for (const line of previewOwnership(root, files, options.command)) stdout.write(`${line}\n`);
    if (options.statusLine) stdout.write(`would configure user status line ${join(root, 'config.toml')}\n`);
    if (options.notify) stdout.write(`would configure user finish notification ${join(root, 'config.toml')}\n`);
    printHookTrustRequirement(files);
    return 0;
  }

  let includeGround = true;
  let groundAfter = null;
  let cleanupGround = () => {};
  if (options.command === 'install') {
    try {
      const decision = await decideGround({
        scope: options.scope,
        yes: options.yes,
        noGround: options.noGround,
        env,
        stdin,
        stdout,
        home,
      });
      includeGround = decision.include;
      groundAfter = decision.afterWrite;
      if (!decision.include) {
        const prepared = ruleSourceForInstall(files);
        files = prepared.files;
        cleanupGround = prepared.cleanup;
      }
    } catch (error) {
      stderr.write(`litgrok: ${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
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
          if (entry.dropped && !retiredSkill && entry.expectedHash !== undefined) {
            stderrLines.push(`Refusing to remove changed file: ${entry.target} is a file this LitGrok release no longer ships, and it differs from the copy the last install wrote. Move it out or remove it yourself, then rerun the install.`);
            continue;
          }
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
        value: { states: owned, counts, manifest, legacyEntries, legacyStates, legacyCounts, retiredDirectories, preservedSkills, kept: keptBesideNotes(root, files, legacyEntries) },
        detail: `${counts.missing} missing · ${counts.current} already-current · ${counts.owned} owned · ${counts.conflicts} conflicts${legacyDetail}`,
      };
    });

    for (const preserved of states.preservedSkills) stderr.write(`Warning: keeping modified legacy skill at ${preserved}; review or remove it yourself.\n`);
    for (const kept of states.kept) stderr.write(`${keptFileWarning(kept)}\n`);
    const caches = oldEngineCaches(env, home, states.manifest, states.counts.owned + states.legacyCounts.owned);

    step = 'WRITE';
    if (options.command === 'uninstall') {
      const writeStarted = process.hrtime.bigint();
      progress.start('WRITE');
      let removed = 0;
      let statusLineResult = null;
      let notifyResult = null;
      try {
        if (options.scope === 'user') {
          statusLineResult = removeStatusLine(root);
          notifyResult = removeNotifications(root);
        }
        for (let index = 0; index < files.length; index += 1) {
          if (!['current', 'owned'].includes(states.states[index])) continue;
          unlinkSync(files[index].target);
          removed += 1;
        }
        removed += removeLegacyFiles(states.legacyEntries);
        removeRetiredDirectories(states.retiredDirectories);
        removeEmptyPayloadDirectories(payloadDirectories(root, [...files, ...states.legacyEntries]));
        removeOwnershipManifest(root, states.manifest);
        const statusDetail = configDetail(statusLineResult, notifyResult);
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
      let notifyResult = null;
      try {
        writeOwnershipManifest(root, files, states.manifest);
        if (options.statusLine) statusLineResult = installStatusLine(root);
        if (options.notify) notifyResult = installNotifications(root);
      } catch (error) {
        if (error && typeof error === 'object') error.step = 'WRITE';
        throw error;
      }
      const statusDetail = configDetail(statusLineResult, notifyResult);
      if (groundAfter) applyStoredGround(home, groundAfter);
      skipStep(progress, 'WRITE', `SKIPPED · 0 written · ${states.counts.current} already-current${statusDetail}`);
      const receipt = receiptCard(options, displayRoot, colors, { status: 'Already current', written: 0, current: states.counts.current });
      progress.close();
      stdout.write(receipt);
      stdout.write(extensionsCard(colors, caches));
      return 0;
    }

    const writeStarted = process.hrtime.bigint();
    progress.start('WRITE');
    let installed = 0;
    try {
      for (let index = 0; index < files.length; index += 1) {
        if (states.states[index] === 'current') continue;
        const { source, target, relativePath } = files[index];
        mkdirSync(dirname(target), { recursive: true });
        if (includeGround && normalizedRelativePath(relativePath) === 'rules/00-litgrok.md' && states.states[index] !== 'missing') {
          backupIfSectionAbsent(target);
        }
        if (states.states[index] === 'owned') replaceOwnedFile(source, target);
        else copyFileSync(source, target, constants.COPYFILE_EXCL);
        installed += 1;
      }
      const removedLegacy = removeLegacyFiles(states.legacyEntries);
      removeRetiredDirectories(states.retiredDirectories);
      removeEmptyPayloadDirectories(payloadDirectories(root, states.legacyEntries));
      writeOwnershipManifest(root, files, states.manifest);
      const statusLineResult = options.statusLine ? installStatusLine(root) : null;
      const notifyResult = options.notify ? installNotifications(root) : null;
      const legacyDetail = removedLegacy === 0 ? '' : ` · ${removedLegacy} legacy removed`;
      const statusDetail = configDetail(statusLineResult, notifyResult);
      if (groundAfter) applyStoredGround(home, groundAfter);
      progress.finish('ok', 'WRITE', `${installed} written · ${states.counts.current} already-current · ${states.counts.owned} owned${legacyDetail}${statusDetail}`, elapsedSince(writeStarted));
    } catch (error) {
      progress.finish('failed', 'WRITE', errorText(error), elapsedSince(writeStarted));
      if (error && typeof error === 'object') error.step = 'WRITE';
      throw error;
    }
    const receipt = receiptCard(options, displayRoot, colors, { status: 'Ready', written: installed, current: states.counts.current });
    progress.close();
    stdout.write(receipt);
    stdout.write(extensionsCard(colors, caches));
    return 0;
  } catch (error) {
    progress.close();
    reportFailure(error, { stderr, stdout, options, root: displayRoot, colors, step });
    return 1;
  } finally {
    cleanupGround();
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
