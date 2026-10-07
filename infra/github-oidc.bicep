targetScope = 'resourceGroup'

@description('Existing ACR used to publish the demo images.')
param acrName string = 'acrokzfv5l7xea3m'

@description('Exact OIDC prefix of the app repository.')
param githubSubjectPrefix string = 'repo:pelithne@45140408/devday-demoapp@1408526483'

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-devday-demoapp-ci'
  location: resourceGroup().location
}

resource federation 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: identity
  name: 'github-registry-build'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    subject: '${githubSubjectPrefix}:environment:registry-build'
    audiences: [
      'api://AzureADTokenExchange'
    ]
  }
}

var acrPushRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '8311e382-0749-4cb8-b61a-304f252e45ec')

resource pushAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, identity.id, acrPushRoleId)
  scope: registry
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPushRoleId
  }
}

output clientId string = identity.properties.clientId
output tenantId string = identity.properties.tenantId
output subscriptionId string = subscription().subscriptionId
output acrName string = registry.name
